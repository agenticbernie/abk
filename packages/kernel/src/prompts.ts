import { formatElephantForPrompt } from './memory.js';
import { formatSkillsForPrompt } from './skill-loader.js';
import { readFilesForPrompt, type RunContext } from './context.js';
import type { GoldfishPacket } from './types.js';

export function buildPlanPrompt(ctx: RunContext): string {
  return [
    'You are the architect persona. Plan the task. Do not edit files.',
    `Goal: ${ctx.goal}`,
    `Matched skills:\n${formatSkillsForPrompt(ctx.matchedSkills)}`,
    `Scoped Elephant memory:\n${formatElephantForPrompt(ctx.memoryEntries)}`,
    `Repository files:\n${ctx.targetFiles.join('\n')}`,
    `File contents:\n${readFilesForPrompt(ctx.cwd, ctx.targetFiles)}`,
    'Return ONLY an <abk_result> JSON object with keys: plan (string), acceptance_criteria (string[]), target_files (string[]).',
  ].join('\n\n');
}

export function buildWorkPrompt(
  ctx: RunContext,
  packet: GoldfishPacket | null,
  feedback: string,
  attempt: number,
): string {
  return [
    'You are the builder persona. Implement the plan with minimal changes.',
    `Goal: ${ctx.goal}`,
    `Plan:\n${packet?.plan ?? 'No plan available.'}`,
    `Acceptance criteria:\n${(packet?.acceptanceCriteria ?? []).map((c) => `- ${c}`).join('\n') || '- None supplied'}`,
    `Scoped Elephant memory:\n${formatElephantForPrompt(ctx.memoryEntries)}`,
    `Goldfish target files:\n${(packet?.files ?? ctx.targetFiles).join('\n')}`,
    `File contents:\n${readFilesForPrompt(ctx.cwd, packet?.files ?? ctx.targetFiles)}`,
    `Previous review feedback (attempt ${attempt + 1}):\n${feedback || 'None'}`,
    `Last error log:\n${packet?.lastErrorLog ?? 'None'}`,
    'Return ONLY an <abk_result> JSON object with keys: summary (string), files_changed (string[]), verification (string).',
  ].join('\n\n');
}

export function buildReviewPrompt(
  ctx: RunContext,
  diff: string,
  acceptanceCriteria: string[],
  attempt: number,
): string {
  return [
    'You are the paranoid reviewer. Audit the diff against acceptance criteria and edge cases.',
    `Goal: ${ctx.goal}`,
    `Acceptance criteria:\n${acceptanceCriteria.map((c) => `- ${c}`).join('\n') || '- None supplied'}`,
    `Attempt: ${attempt + 1}`,
    `Git diff:\n${diff || 'No diff.'}`,
    'Return ONLY an <abk_result> JSON object with keys: status ("pass" or "fail"), feedbackForRetry (string), issues (string[]), edge_cases (string[]).',
  ].join('\n\n');
}

export function buildCompoundPrompt(ctx: RunContext, diff: string, acceptanceCriteria: string[]): string {
  return [
    'You are the distiller. Extract durable lessons from this completed task.',
    `Goal: ${ctx.goal}`,
    `Acceptance criteria:\n${acceptanceCriteria.map((c) => `- ${c}`).join('\n') || '- None supplied'}`,
    `Git diff:\n${diff || 'No diff.'}`,
    'Return ONLY an <abk_result> JSON object with key lessons: array of { category: invariant|gotcha|pattern|decision, scope, title?, content, tags? }.',
  ].join('\n\n');
}
