import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultConfig, runOrchestrator, saveConfig } from '@abk/kernel';

let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(path.join(tmpdir(), 'abk-e2e-'));
  saveConfig(cwd, defaultConfig({ verifyCommands: [] }));
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

describe('orchestrator e2e', () => {
  it('runs Plan->Work->Review retry->Compound and writes memory', async () => {
    const result = await runOrchestrator({ cwd, goal: 'Add input validation helper', dryRun: true });
    expect(result.ok).toBe(true);
    const phases = result.phases.map((p) => p.phase);
    expect(phases).toContain('plan');
    expect(phases).toContain('work');
    expect(phases).toContain('review');
    expect(phases).toContain('compound');
    expect(result.lessonsAdded).toBeGreaterThanOrEqual(1);
    // Retry means at least two work phases.
    expect(phases.filter((p) => p === 'work').length).toBeGreaterThanOrEqual(2);
  });
});
