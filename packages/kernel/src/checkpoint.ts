import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { type Result } from './types.js';

export interface CheckpointRecord {
  id: string;
  createdAt: string;
  cwd: string;
  isGit: boolean;
  baseHead: string | null;
  stashCommit: string | null;
  patchFile: string | null;
}

function runGit(cwd: string, args: string[]): { ok: boolean; stdout: string; stderr: string; code: number } {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return {
    ok: result.status === 0,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
    code: result.status ?? -1,
  };
}

export function isGitRepo(cwd: string): boolean {
  const result = runGit(cwd, ['rev-parse', '--is-inside-work-tree']);
  return result.ok && result.stdout === 'true';
}

export function gitDiff(cwd: string, cached = false): Result<string> {
  if (!isGitRepo(cwd)) return { ok: true, value: '' };
  const args = cached ? ['diff', '--cached'] : ['diff', 'HEAD'];
  const result = runGit(cwd, args);
  if (!result.ok) {
    // Fall back to working tree diff.
    const fallback = runGit(cwd, ['diff']);
    return { ok: true, value: fallback.stdout };
  }
  // Include untracked files as a best-effort diff.
  const untracked = runGit(cwd, ['ls-files', '--others', '--exclude-standard']);
  let output = result.stdout;
  if (untracked.ok && untracked.stdout) {
    output += `\n\n# Untracked files\n${untracked.stdout}`;
  }
  return { ok: true, value: output };
}

export function createCheckpoint(cwd: string, checkpointsDir: string, label = 'abk'): Result<CheckpointRecord> {
  const dir = path.isAbsolute(checkpointsDir) ? checkpointsDir : path.resolve(cwd, checkpointsDir);
  mkdirSync(dir, { recursive: true });
  const id = `${label}-${Date.now()}`;
  const recordPath = path.join(dir, `${id}.json`);

  if (!isGitRepo(cwd)) {
    const record: CheckpointRecord = {
      id,
      createdAt: new Date().toISOString(),
      cwd,
      isGit: false,
      baseHead: null,
      stashCommit: null,
      patchFile: null,
    };
    try {
      writeFileSync(recordPath, JSON.stringify(record, null, 2), 'utf8');
      return { ok: true, value: record };
    } catch (error) {
      return { ok: false, error: `Failed to write checkpoint: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  const head = runGit(cwd, ['rev-parse', 'HEAD']);
  const baseHead = head.ok ? head.stdout : null;
  const stash = runGit(cwd, ['stash', 'create', `abk-checkpoint ${id}`]);
  const stashCommit = stash.ok && stash.stdout ? stash.stdout : null;

  // Also store a patch for portability.
  const patchFile = path.join(dir, `${id}.patch`);
  const diff = runGit(cwd, ['diff', 'HEAD']);
  try {
    writeFileSync(patchFile, diff.stdout, 'utf8');
  } catch {
    // Non-fatal.
  }

  const record: CheckpointRecord = {
    id,
    createdAt: new Date().toISOString(),
    cwd,
    isGit: true,
    baseHead,
    stashCommit,
    patchFile,
  };
  try {
    writeFileSync(recordPath, JSON.stringify(record, null, 2), 'utf8');
    return { ok: true, value: record };
  } catch (error) {
    return { ok: false, error: `Failed to write checkpoint: ${error instanceof Error ? error.message : String(error)}` };
  }
}

export function readCheckpoint(cwd: string, checkpointsDir: string, id: string): Result<CheckpointRecord> {
  const dir = path.isAbsolute(checkpointsDir) ? checkpointsDir : path.resolve(cwd, checkpointsDir);
  const recordPath = path.join(dir, `${id}.json`);
  if (!existsSync(recordPath)) return { ok: false, error: `Checkpoint not found: ${id}` };
  try {
    return { ok: true, value: JSON.parse(readFileSync(recordPath, 'utf8')) as CheckpointRecord };
  } catch (error) {
    return { ok: false, error: `Failed to read checkpoint: ${error instanceof Error ? error.message : String(error)}` };
  }
}

export function listCheckpoints(cwd: string, checkpointsDir: string): Result<CheckpointRecord[]> {
  const dir = path.isAbsolute(checkpointsDir) ? checkpointsDir : path.resolve(cwd, checkpointsDir);
  if (!existsSync(dir)) return { ok: true, value: [] };
  const records: CheckpointRecord[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    const result = readCheckpoint(cwd, checkpointsDir, name.replace(/\.json$/, ''));
    if (result.ok) records.push(result.value);
  }
  return { ok: true, value: records.sort((a, b) => a.createdAt.localeCompare(b.createdAt)) };
}

export function rollbackCheckpoint(cwd: string, record: CheckpointRecord): Result<void> {
  if (!record.isGit) return { ok: true, value: undefined };
  if (!isGitRepo(cwd)) return { ok: false, error: 'Not a git repository' };
  if (record.baseHead) {
    const reset = runGit(cwd, ['reset', '--hard', record.baseHead]);
    if (!reset.ok) return { ok: false, error: reset.stderr || 'Failed to reset to base HEAD' };
    runGit(cwd, ['clean', '-fd']);
  }
  if (record.stashCommit) {
    const apply = runGit(cwd, ['stash', 'apply', '--index', record.stashCommit]);
    if (!apply.ok) return { ok: false, error: apply.stderr || 'Failed to apply checkpoint stash' };
  }
  return { ok: true, value: undefined };
}
