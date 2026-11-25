import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { minimatch } from 'minimatch';
import { ElephantEntrySchema, GoldfishPacketSchema, type ElephantEntry, type GoldfishPacket, type Result } from './types.js';
import { resolvePath } from './config.js';

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

function readJsonl<T>(filePath: string, schema: { parse: (value: unknown) => T }): Result<T[]> {
  if (!existsSync(filePath)) return { ok: true, value: [] };
  try {
    const lines = readFileSync(filePath, 'utf8').split(/\r?\n/).filter((line) => line.trim().length > 0);
    const entries: T[] = [];
    for (const line of lines) {
      entries.push(schema.parse(JSON.parse(line)));
    }
    return { ok: true, value: entries };
  } catch (error) {
    return { ok: false, error: `Failed to read JSONL ${filePath}: ${error instanceof Error ? error.message : String(error)}` };
  }
}

export function readElephantMemory(cwd: string, config: { paths: { memory_file: string } }): Result<ElephantEntry[]> {
  const filePath = resolvePath(cwd, config.paths.memory_file);
  return readJsonl(filePath, ElephantEntrySchema);
}

function normalizeEntry(entry: ElephantEntry): string {
  return `${entry.category}|${entry.scope}|${entry.content.trim().toLowerCase()}`;
}

export function appendElephantEntry(
  cwd: string,
  config: { paths: { memory_file: string } },
  entry: ElephantEntry,
): Result<{ added: boolean; entry: ElephantEntry }> {
  const filePath = resolvePath(cwd, config.paths.memory_file);
  ensureDir(path.dirname(filePath));
  const existingResult = readElephantMemory(cwd, config);
  if (!existingResult.ok) return existingResult;
  const normalized = normalizeEntry(entry);
  if (existingResult.value.some((item) => normalizeEntry(item) === normalized)) {
    return { ok: true, value: { added: false, entry } };
  }
  try {
    writeFileSync(filePath, `${JSON.stringify(entry)}\n`, { flag: 'a', encoding: 'utf8' });
    return { ok: true, value: { added: true, entry } };
  } catch (error) {
    return { ok: false, error: `Failed to append memory: ${error instanceof Error ? error.message : String(error)}` };
  }
}

export function pruneElephantMemory(
  cwd: string,
  config: { paths: { memory_file: string } },
): Result<{ removed: number; kept: number }> {
  const filePath = resolvePath(cwd, config.paths.memory_file);
  const result = readElephantMemory(cwd, config);
  if (!result.ok) return result;
  const seen = new Set<string>();
  const kept: ElephantEntry[] = [];
  for (const entry of result.value) {
    const key = normalizeEntry(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(entry);
  }
  try {
    writeFileSync(filePath, kept.map((e) => JSON.stringify(e)).join('\n') + (kept.length ? '\n' : ''), 'utf8');
    return { ok: true, value: { removed: result.value.length - kept.length, kept: kept.length } };
  } catch (error) {
    return { ok: false, error: `Failed to prune memory: ${error instanceof Error ? error.message : String(error)}` };
  }
}

export function filterElephantByScope(entries: ElephantEntry[], files: string[]): ElephantEntry[] {
  if (files.length === 0) return entries;
  return entries.filter((entry) => {
    if (entry.scope === 'global' || entry.scope === '*') return true;
    return files.some((file) => minimatch(file, entry.scope, { dot: true }));
  });
}

export function formatElephantForPrompt(entries: ElephantEntry[]): string {
  if (entries.length === 0) return 'No scoped Elephant memory entries.';
  return entries
    .map((entry) => `- [${entry.category}] (${entry.scope}) ${entry.title ? entry.title + ': ' : ''}${entry.content}`)
    .join('\n');
}

export class GoldfishSession {
  constructor(private readonly sessionDir: string) {}

  dir(): string {
    return this.sessionDir;
  }

  ensure(): void {
    mkdirSync(this.sessionDir, { recursive: true });
  }

  packetPath(): string {
    return path.join(this.sessionDir, 'packet.json');
  }

  planPath(): string {
    return path.join(this.sessionDir, 'current-plan.md');
  }

  auditPath(): string {
    return path.join(this.sessionDir, 'diff-audit.json');
  }

  writePacket(packet: GoldfishPacket): Result<void> {
    this.ensure();
    try {
      writeFileSync(this.packetPath(), JSON.stringify(packet, null, 2), 'utf8');
      return { ok: true, value: undefined };
    } catch (error) {
      return { ok: false, error: `Failed to write packet: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  readPacket(): Result<GoldfishPacket | null> {
    if (!existsSync(this.packetPath())) return { ok: true, value: null };
    try {
      const parsed = GoldfishPacketSchema.parse(JSON.parse(readFileSync(this.packetPath(), 'utf8')));
      return { ok: true, value: parsed };
    } catch (error) {
      return { ok: false, error: `Failed to read packet: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  writePlan(markdown: string): Result<void> {
    this.ensure();
    try {
      writeFileSync(this.planPath(), markdown, 'utf8');
      return { ok: true, value: undefined };
    } catch (error) {
      return { ok: false, error: `Failed to write plan: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  readPlan(): Result<string | null> {
    if (!existsSync(this.planPath())) return { ok: true, value: null };
    try {
      return { ok: true, value: readFileSync(this.planPath(), 'utf8') };
    } catch (error) {
      return { ok: false, error: `Failed to read plan: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  writeAudit(audit: unknown): Result<void> {
    this.ensure();
    try {
      writeFileSync(this.auditPath(), JSON.stringify(audit, null, 2), 'utf8');
      return { ok: true, value: undefined };
    } catch (error) {
      return { ok: false, error: `Failed to write audit: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  cleanup(): Result<void> {
    try {
      if (existsSync(this.sessionDir)) {
        for (const name of readdirSync(this.sessionDir)) {
          const target = path.join(this.sessionDir, name);
          const stat = statSync(target);
          if (stat.isDirectory()) rmSync(target, { recursive: true, force: true });
          else rmSync(target, { force: true });
        }
      }
      return { ok: true, value: undefined };
    } catch (error) {
      return { ok: false, error: `Failed to cleanup session: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
}

export function createGoldfishSession(cwd: string, sessionDir: string): GoldfishSession {
  return new GoldfishSession(path.isAbsolute(sessionDir) ? sessionDir : path.resolve(cwd, sessionDir));
}
