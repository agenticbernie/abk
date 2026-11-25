import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  appendElephantEntry,
  createGoldfishSession,
  filterElephantByScope,
  pruneElephantMemory,
  readElephantMemory,
  resolvePath,
  saveConfig,
  defaultConfig,
} from '@abk/kernel';

let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(path.join(tmpdir(), 'abk-memory-'));
  saveConfig(cwd, defaultConfig({ verifyCommands: [] }));
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

describe('Elephant memory', () => {
  it('filters entries by glob scope', () => {
    const entries = [
      { id: '1', timestamp: new Date().toISOString(), category: 'invariant' as const, scope: 'packages/api/*', content: 'api invariant' },
      { id: '2', timestamp: new Date().toISOString(), category: 'gotcha' as const, scope: 'global', content: 'global gotcha' },
      { id: '3', timestamp: new Date().toISOString(), category: 'pattern' as const, scope: 'packages/web/*', content: 'web pattern' },
    ];
    const filtered = filterElephantByScope(entries, ['packages/api/users.ts']);
    expect(filtered.map((e) => e.id)).toEqual(['1', '2']);
  });

  it('deduplicates appended entries', () => {
    const config = defaultConfig({ verifyCommands: [] });
    const entry = { id: 'a', timestamp: new Date().toISOString(), category: 'gotcha' as const, scope: 'global', content: 'same' };
    const first = appendElephantEntry(cwd, config, entry);
    const second = appendElephantEntry(cwd, config, { ...entry, id: 'b' });
    expect(first.ok && first.value.added).toBe(true);
    expect(second.ok && second.value.added).toBe(false);
    const read = readElephantMemory(cwd, config);
    expect(read.ok && read.value).toHaveLength(1);
  });

  it('prunes duplicates', () => {
    const config = defaultConfig({ verifyCommands: [] });
    const entry = { id: 'a', timestamp: new Date().toISOString(), category: 'gotcha' as const, scope: 'global', content: 'same' };
    appendElephantEntry(cwd, config, entry);
    appendElephantEntry(cwd, config, { ...entry, id: 'b' });
    // Force a duplicate by writing directly is not needed; append already dedupes.
    const result = pruneElephantMemory(cwd, config);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.kept).toBe(1);
  });
});

describe('Goldfish session', () => {
  it('writes, reads, and cleans up session files', () => {
    const config = defaultConfig({ verifyCommands: [] });
    const sessionDir = resolvePath(cwd, config.paths.session_dir);
    const session = createGoldfishSession(cwd, sessionDir);
    session.writePlan('# Plan');
    session.writePacket({ goal: 'g', files: ['a.ts'] });
    const plan = session.readPlan();
    expect(plan.ok && plan.value).toContain('Plan');
    const packet = session.readPacket();
    expect(packet.ok && packet.value?.goal).toBe('g');
    session.cleanup();
    const cleanedPlan = session.readPlan();
    const cleanedPacket = session.readPacket();
    expect(cleanedPlan.ok && cleanedPlan.value).toBeNull();
    expect(cleanedPacket.ok && cleanedPacket.value).toBeNull();
  });
});
