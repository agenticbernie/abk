import path from 'node:path';
import { type OrchestratorInput, type Result } from './types.js';
import { formatElephantForPrompt } from './memory.js';
import { extractResult } from './context.js';
import { buildPlanPrompt, buildReviewPrompt } from './prompts.js';
import { invoke, prepare } from './pipeline.js';

export interface PlanOutput {
  plan: string;
  acceptanceCriteria: string[];
  memory: string;
}

/** Run only the architect phase and persist the plan to the Goldfish session. */
export async function runPlan(input: OrchestratorInput): Promise<Result<PlanOutput>> {
  const prepared = await prepare(path.resolve(input.cwd), input);
  if (!prepared.ok) return { ok: false, error: prepared.error };
  const ctx = prepared.value;

  const response = await invoke(ctx, 'architect', buildPlanPrompt(ctx));
  if (!response.ok) return { ok: false, error: response.error };
  const parsed = extractResult(response.value.stdout) ?? {};
  const plan = typeof parsed.plan === 'string' ? parsed.plan : response.value.stdout;
  const acceptanceCriteria = Array.isArray(parsed.acceptance_criteria)
    ? parsed.acceptance_criteria.map(String)
    : [];
  const targetFiles =
    Array.isArray(parsed.target_files) && parsed.target_files.length > 0
      ? parsed.target_files.map(String)
      : ctx.targetFiles;

  ctx.session.writePlan(
    `# Plan\n\n${plan}\n\n## Acceptance Criteria\n${acceptanceCriteria.map((c) => `- ${c}`).join('\n') || '- None supplied'}\n`,
  );
  ctx.session.writePacket({
    goal: input.goal,
    files: targetFiles,
    startedAt: new Date().toISOString(),
    plan,
    acceptanceCriteria,
  });

  return {
    ok: true,
    value: { plan, acceptanceCriteria, memory: formatElephantForPrompt(ctx.memoryEntries) },
  };
}

/** Review an explicit diff without running the full pipeline. */
export async function reviewDiff(
  input: OrchestratorInput & { diff: string; acceptanceCriteria?: string[] },
): Promise<Result<Record<string, unknown>>> {
  const prepared = await prepare(path.resolve(input.cwd), input);
  if (!prepared.ok) return { ok: false, error: prepared.error };
  const ctx = prepared.value;

  const response = await invoke(
    ctx,
    'paranoid-reviewer',
    buildReviewPrompt(ctx, input.diff, input.acceptanceCriteria ?? [], 0),
  );
  if (!response.ok) return { ok: false, error: response.error };
  const parsed = extractResult(response.value.stdout);
  if (!parsed) return { ok: false, error: 'Reviewer returned no parseable <abk_result> JSON' };
  ctx.session.cleanup();
  return { ok: true, value: parsed };
}
