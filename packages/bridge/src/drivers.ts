import { spawn } from 'node:child_process';
import type { DriverConfig, DriverOutput, Persona, Result } from '@abk/kernel';
import { ok, err } from '@abk/kernel';

export interface DriverRunInput {
  persona: Persona;
  driver: DriverConfig;
  prompt: string;
  cwd: string;
  timeoutMs: number;
  dryRun?: boolean;
  /** Zero-based review attempt; only pipeline reviews set this. */
  attempt?: number;
}

function resolveDriver(driver: DriverConfig, dryRun?: boolean): DriverConfig {
  if (dryRun) return { driver: 'mock' };
  return driver;
}

function mockOutput(persona: Persona): string {
  switch (persona) {
    case 'architect':
      return `<abk_result>{"plan":"1. Inspect files.\\n2. Implement change.\\n3. Verify.\\n4. Review.","acceptance_criteria":["Requested behavior implemented","Verification passes"],"target_files":[]}</abk_result>`;
    case 'builder':
      return `<abk_result>{"summary":"Applied changes.","files_changed":[],"verification":"passed"}</abk_result>`;
    case 'paranoid-reviewer':
      return `<abk_result>{"status":"pass","feedbackForRetry":"","issues":[],"edge_cases":["empty input"]}</abk_result>`;
    case 'distiller':
      return `<abk_result>{"lessons":[{"category":"pattern","scope":"global","content":"Keep changes minimal and verified."}]}</abk_result>`;
    default:
      return `<abk_result>{"status":"pass"}</abk_result>`;
  }
}

function runMock(input: DriverRunInput): Result<DriverOutput> {
  // Pipeline reviews fail on attempt 0 so --dry-run exercises the retry loop.
  // Standalone reviews leave `attempt` undefined and pass deterministically.
  if (input.persona === 'paranoid-reviewer' && input.attempt === 0) {
    return ok({
      stdout: `<abk_result>{"status":"fail","feedbackForRetry":"Add input validation and handle the empty case, then retry.","issues":["Missing input validation"],"edge_cases":["Empty input","Malformed input"]}</abk_result>`,
      stderr: '',
      exitCode: 0,
    });
  }
  return ok({ stdout: mockOutput(input.persona), stderr: '', exitCode: 0 });
}

function spawnCli(command: string, args: string[], cwd: string, timeoutMs: number, stdinData?: string): Promise<Result<DriverOutput>> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve(err(`Failed to spawn ${command}: ${error.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) resolve(err(`${command} timed out`));
      else resolve(ok({ stdout, stderr, exitCode: code ?? 0 }));
    });
    if (stdinData !== undefined) {
      child.stdin.write(stdinData);
    }
    child.stdin.end();
  });
}

export async function runDriver(input: DriverRunInput): Promise<Result<DriverOutput>> {
  const driver = resolveDriver(input.driver, input.dryRun);
  switch (driver.driver) {
    case 'mock':
      return runMock(input);
    case 'claude':
      return spawnCli('claude', ['-p', input.prompt, ...(driver.args ?? [])], input.cwd, input.timeoutMs);
    case 'codex':
      return spawnCli('codex', ['exec', input.prompt, ...(driver.args ?? [])], input.cwd, input.timeoutMs);
    case 'gemini':
      return spawnCli('gemini', ['-p', input.prompt, ...(driver.args ?? [])], input.cwd, input.timeoutMs);
    case 'opencode':
      return spawnCli('opencode', ['run', input.prompt, ...(driver.args ?? [])], input.cwd, input.timeoutMs);
    case 'freebuff':
      return spawnCli('freebuff', [input.prompt, ...(driver.args ?? [])], input.cwd, input.timeoutMs);
    case 'custom': {
      const timeout = input.timeoutMs ?? driver.timeout_ms ?? 120000;
      if (driver.command && driver.command.includes('{{prompt}}')) {
        const command = driver.command.split('{{prompt}}').join(input.prompt);
        return spawnCli('sh', ['-c', command], input.cwd, timeout);
      }
      // Pipe prompt to stdin via sh -c if command provided.
      if (driver.command) {
        return spawnCli('sh', ['-c', driver.command], input.cwd, timeout, input.prompt);
      }
      return err('Custom driver requires command template');
    }
    default:
      return err(`Unknown driver: ${driver.driver}`);
  }
}
