import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  type AbkConfig,
  type ElephantEntry,
  type GoldfishPacket,
  type OrchestratorInput,
  type OrchestratorResult,
  type ProgressEvent,
  type StepResult,
} from './types.js';
import { appendElephantEntry, filterElephantByScope, readElephantMemory } from './memory.js';
import { resolvePath } from './config.js';
import { createCheckpoint, gitDiff } from './checkpoint.js';
import { formatVerificationReport, runCommands } from './verifier.js';
import { extractResult } from './context.js';
import { buildCompoundPrompt, buildPlanPrompt, buildReviewPrompt, buildWorkPrompt } from './prompts.js';
import { invoke, prepare } from './pipeline.js';

function emit(input: OrchestratorInput, event: ProgressEvent): void {
  input.onProgress?.(event);
}

function makeStep(
  phase: StepResult['phase'],
  okValue: boolean,
  output: string,
  parsed?: Record<string, unknown>,
  durationMs = 0,
  error?: string,
): StepResult {
  return { phase, ok: okValue, output, parsed, durationMs, error };
}

function currentDiff(cwd: string): string {
  const result = gitDiff(cwd);
  return result.ok ? (result.value ?? '') : '';
}

function normalizeLessons(raw: unknown, targetFiles: string[]): ElephantEntry[] {
  if (!Array.isArray(raw)) return [];
  const categories = new Set(['invariant', 'gotcha', 'pattern', 'decision']);
  const entries: ElephantEntry[] = [];
  for (const lesson of raw) {
    if (!lesson || typeof lesson !== 'object') continue;
    const record = lesson as Record<string, unknown>;
    const content = String(record.content ?? record.lesson ?? '').trim();
    if (!content) continue;
    entries.push({
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      category: categories.has(String(record.category))
        ? (record.category as ElephantEntry['category'])
        : 'pattern',
      scope:
        typeof record.scope === 'string' && record.scope ? record.scope : (targetFiles[0] ?? 'global'),
      title: typeof record.title === 'string' ? record.title : undefined,
      content,
      tags: Array.isArray(record.tags) ? record.tags.map(String) : undefined,
      author: 'agent',
    });
  }
  return entries;
}

async function verify(
  cwd: string,
  config: AbkConfig,
): Promise<{ passed: boolean; report: string }> {
  if (config.verify_commands.length === 0) {
    return { passed: true, report: 'No verification commands configured.' };
  }
  const report = await runCommands(config.verify_commands, {
    cwd,
    timeoutMs: config.command_timeout_ms,
  });
  if (!report.ok) return { passed: false, report: report.error };
  return { passed: report.value.allPassed, report: formatVerificationReport(report.value) };
}

export async function runOrchestrator(input: OrchestratorInput): Promise<OrchestratorResult> {
  const cwd = path.resolve(input.cwd);
  const prepared = await prepare(cwd, input);
  if (!prepared.ok) {
    return { ok: false, goal: input.goal, phases: [], lessonsAdded: 0, error: prepared.error };
  }

  const ctx = prepared.value;
  const { config, session } = ctx;
  const phases: StepResult[] = [];
  const fail = (error: string): OrchestratorResult => ({
    ok: false,
    goal: input.goal,
    phases,
    lessonsAdded: 0,
    error,
  });

  // ---------- Plan ----------
  emit(input, { type: 'phase_start', phase: 'plan', message: 'Planning with architect...' });
  const planStart = Date.now();
  const planResponse = await invoke(ctx, 'architect', buildPlanPrompt(ctx));
  if (!planResponse.ok) return fail(planResponse.error);

  const planParsed = extractResult(planResponse.value.stdout) ?? {};
  const planText = typeof planParsed.plan === 'string' ? planParsed.plan : planResponse.value.stdout;
  const acceptanceCriteria = Array.isArray(planParsed.acceptance_criteria)
    ? planParsed.acceptance_criteria.map(String)
    : [];
  const plannedFiles = Array.isArray(planParsed.target_files) ? planParsed.target_files.map(String) : [];
  if (plannedFiles.length > 0) {
    ctx.targetFiles = plannedFiles;
    const scoped = readElephantMemory(cwd, config);
    if (scoped.ok) ctx.memoryEntries = filterElephantByScope(scoped.value, plannedFiles);
  }

  session.writePacket({
    goal: input.goal,
    files: ctx.targetFiles,
    startedAt: new Date().toISOString(),
    plan: planText,
    acceptanceCriteria,
  });
  session.writePlan(
    `# Plan\n\n${planText}\n\n## Acceptance Criteria\n${acceptanceCriteria.map((c) => `- ${c}`).join('\n') || '- None supplied'}\n`,
  );
  phases.push(makeStep('plan', true, planResponse.value.stdout, planParsed, Date.now() - planStart));
  emit(input, { type: 'phase_end', phase: 'plan', message: 'Plan complete' });

  // ---------- Work -> Review with retry loop ----------
  let reviewPassed = false;
  let retryFeedback = '';

  for (let attempt = 0; attempt <= config.max_review_loops; attempt += 1) {
    emit(input, { type: 'phase_start', phase: 'work', message: `Work attempt ${attempt + 1}...` });
    const workStart = Date.now();
    const packetResult = session.readPacket();
    const packet = packetResult.ok ? packetResult.value : null;
    const workResponse = await invoke(ctx, 'builder', buildWorkPrompt(ctx, packet, retryFeedback, attempt));
    if (!workResponse.ok) return fail(workResponse.error);
    const workParsed = extractResult(workResponse.value.stdout) ?? {};

    const verification = await verify(cwd, config);
    const checkpoint = createCheckpoint(
      cwd,
      resolvePath(cwd, config.paths.checkpoints_dir),
      `work-${attempt + 1}`,
    );
    if (checkpoint.ok) {
      const latest = session.readPacket();
      if (latest.ok && latest.value) {
        session.writePacket({ ...latest.value, checkpoint: checkpoint.value.id });
      }
    }

    phases.push(makeStep('work', true, workResponse.value.stdout, workParsed, Date.now() - workStart));
    emit(input, {
      type: 'phase_end',
      phase: 'work',
      message: verification.passed ? 'Work complete' : 'Verification failed',
    });

    emit(input, { type: 'phase_start', phase: 'review', message: 'Reviewing changes...' });
    const reviewStart = Date.now();
    const diff = currentDiff(cwd);
    session.writeAudit({ attempt: attempt + 1, diff, verifyPassed: verification.passed, log: verification.report });

    if (!verification.passed) {
      retryFeedback = `Verification failed. Fix these failures and retry:\n${verification.report}`;
      phases.push(makeStep('review', false, retryFeedback, { status: 'fail' }, Date.now() - reviewStart));
      emit(input, { type: 'phase_end', phase: 'review', message: 'Review failed (verification)' });
    } else {
      const reviewResponse = await invoke(
        ctx,
        'paranoid-reviewer',
        buildReviewPrompt(ctx, diff, acceptanceCriteria, attempt),
        attempt,
      );
      if (!reviewResponse.ok) return fail(reviewResponse.error);
      const reviewParsed = extractResult(reviewResponse.value.stdout) ?? {};
      const status = String(reviewParsed.status ?? 'fail').toLowerCase();
      retryFeedback = String(reviewParsed.feedbackForRetry ?? '');
      phases.push(
        makeStep('review', status === 'pass', reviewResponse.value.stdout, reviewParsed, Date.now() - reviewStart),
      );
      emit(input, {
        type: 'phase_end',
        phase: 'review',
        message: status === 'pass' ? 'Review passed' : 'Review failed',
      });
      if (status === 'pass') {
        reviewPassed = true;
        break;
      }
      retryFeedback ||= 'Review failed. Address the reported issues and retry.';
    }

    if (attempt < config.max_review_loops) {
      const latest = session.readPacket();
      if (latest.ok && latest.value) {
        session.writePacket({ ...latest.value, lastErrorLog: retryFeedback, diff });
      }
    }
  }

  if (!reviewPassed) {
    return fail(
      `Review did not pass after ${config.max_review_loops + 1} attempts. Last feedback: ${retryFeedback}`,
    );
  }

  // ---------- Compound ----------
  let lessonsAdded = 0;
  if (!input.noCompound) {
    emit(input, { type: 'phase_start', phase: 'compound', message: 'Compounding lessons...' });
    const compoundStart = Date.now();
    const compoundResponse = await invoke(
      ctx,
      'distiller',
      buildCompoundPrompt(ctx, currentDiff(cwd), acceptanceCriteria),
    );
    if (compoundResponse.ok) {
      const parsed = extractResult(compoundResponse.value.stdout) ?? {};
      for (const entry of normalizeLessons(parsed.lessons, ctx.targetFiles)) {
        const appended = appendElephantEntry(cwd, config, entry);
        if (appended.ok && appended.value.added) lessonsAdded += 1;
      }
      phases.push(makeStep('compound', true, compoundResponse.value.stdout, parsed, Date.now() - compoundStart));
    } else {
      phases.push(
        makeStep('compound', false, '', undefined, Date.now() - compoundStart, compoundResponse.error),
      );
    }
    emit(input, { type: 'phase_end', phase: 'compound', message: `Compound complete (${lessonsAdded} new)` });
  }

  session.cleanup();
  return { ok: true, goal: input.goal, phases, lessonsAdded };
}
