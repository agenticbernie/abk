import { spawn } from 'node:child_process';
import { type VerificationReport, type VerificationResult, type Result } from './types.js';

export interface RunCommandsOptions {
  cwd: string;
  timeoutMs: number;
}

export async function runCommands(
  commands: string[],
  options: RunCommandsOptions,
): Promise<Result<VerificationReport>> {
  const results: VerificationResult[] = [];
  for (const command of commands) {
    const started = Date.now();
    const result = await runOne(command, options);
    results.push({ ...result, durationMs: Date.now() - started });
  }
  return { ok: true, value: { results, allPassed: results.every((r) => r.exitCode === 0 && !r.timedOut) } };
}

function runOne(command: string, options: RunCommandsOptions): Promise<Omit<VerificationResult, 'durationMs'>> {
  return new Promise((resolve) => {
    const child = spawn(command, { cwd: options.cwd, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, options.timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ command, exitCode: -1, stdout, stderr: `${stderr}\n${error.message}`.trim(), timedOut });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ command, exitCode: code ?? (timedOut ? 124 : -1), stdout, stderr, timedOut });
    });
  });
}

export function formatVerificationReport(report: VerificationReport): string {
  return report.results
    .map((r) => `Command: ${r.command}\nExit: ${r.exitCode}${r.timedOut ? ' (timed out)' : ''}\nSTDOUT:\n${r.stdout}\nSTDERR:\n${r.stderr}`)
    .join('\n\n---\n\n');
}
