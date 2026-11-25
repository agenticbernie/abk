import { existsSync, readFileSync, readdirSync, statSync, type Dirent } from 'node:fs';
import path from 'node:path';
import { minimatch } from 'minimatch';
import type { AbkConfig, ElephantEntry, OrchestratorInput, SkillDef } from './types.js';
import { GoldfishSession } from './memory.js';

const IGNORED_DIRS = new Set(['.git', 'node_modules', '.abk', 'dist', 'build', '.next', 'coverage', '.turbo']);

export interface RunContext {
  cwd: string;
  goal: string;
  config: AbkConfig;
  input: OrchestratorInput;
  session: GoldfishSession;
  skills: SkillDef[];
  matchedSkills: SkillDef[];
  targetFiles: string[];
  memoryEntries: ElephantEntry[];
}

export function listFiles(cwd: string, limit = 200): string[] {
  const result: string[] = [];
  function walk(dir: string): void {
    let entries: Dirent[] = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) result.push(path.relative(cwd, full).split(path.sep).join('/'));
      if (result.length >= limit) return;
    }
  }
  walk(cwd);
  return result.slice(0, limit);
}

export function expandGlobs(cwd: string, patterns?: string[]): string[] {
  if (!patterns || patterns.length === 0) return [];
  const all = listFiles(cwd, 2000);
  const matched = new Set<string>();
  for (const pattern of patterns) {
    for (const file of all) {
      if (minimatch(file, pattern, { dot: true })) matched.add(file);
    }
    const direct = pattern.replace(/^\.\//, '');
    if (existsSync(path.resolve(cwd, direct))) matched.add(direct);
  }
  return [...matched];
}

export function readFilesForPrompt(cwd: string, files: string[]): string {
  const chunks: string[] = [];
  for (const file of files.slice(0, 20)) {
    const full = path.resolve(cwd, file);
    if (!existsSync(full)) continue;
    try {
      if (statSync(full).size > 100_000) continue;
      chunks.push(`### ${file}\n\`\`\`\n${readFileSync(full, 'utf8').slice(0, 8000)}\n\`\`\``);
    } catch {
      // Skip unreadable files rather than failing the whole run.
    }
  }
  return chunks.length ? chunks.join('\n\n') : 'No target files selected.';
}

export function safeJsonParse<T = unknown>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export function extractResult(text: string): Record<string, unknown> | null {
  const stripFences = (value: string) =>
    value.replace(/```(?:json|js|ts)?\s*([\s\S]*?)```/gi, '$1');
  const candidates: string[] = [];
  const tagged = text.match(/<abk_result\b[^>]*>([\s\S]*?)<\/abk_result>/i);
  const base = tagged ? tagged[1].trim() : stripFences(text).trim();
  candidates.push(base);
  const start = base.indexOf('{');
  const end = base.lastIndexOf('}');
  if (start >= 0 && end > start) candidates.push(base.slice(start, end + 1));
  for (const candidate of candidates) {
    const parsed = safeJsonParse<Record<string, unknown>>(candidate);
    if (parsed && typeof parsed === 'object') return parsed;
    const repaired = safeJsonParse<Record<string, unknown>>(repairJsonText(candidate));
    if (repaired && typeof repaired === 'object') return repaired;
  }
  return null;
}

function repairJsonText(input: string): string {
  return input
    .trim()
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":')
    .replace(/'([^']*)'/g, '"$1"');
}
