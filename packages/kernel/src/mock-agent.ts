import { ok, type DriverConfig, type DriverOutput, type DriverRunner, type Persona, type Result } from './types.js';

function mockOutput(persona: Persona): string {
  switch (persona) {
    case 'architect':
      return `<abk_result>${JSON.stringify({
        plan: '1. Inspect the target files.\n2. Implement the smallest correct change.\n3. Run verification commands.\n4. Review before compounding.',
        acceptance_criteria: ['Requested behavior is implemented', 'Verification commands pass', 'No obvious regressions'],
        target_files: [],
      })}</abk_result>`;
    case 'builder':
      return `<abk_result>${JSON.stringify({
        summary: 'Applied the planned changes.',
        files_changed: [],
        verification: 'pending',
      })}</abk_result>`;
    case 'qa-runner':
      return `<abk_result>${JSON.stringify({ status: 'pass', checks: [] })}</abk_result>`;
    case 'distiller':
      return `<abk_result>${JSON.stringify({
        lessons: [
          {
            category: 'pattern',
            scope: 'global',
            title: 'Verify before review',
            content: 'Run deterministic verification before asking for review so reviewers see a working diff.',
          },
        ],
      })}</abk_result>`;
    case 'paranoid-reviewer':
    default:
      return `<abk_result>${JSON.stringify({ status: 'pass', feedbackForRetry: '', issues: [], edge_cases: [] })}</abk_result>`;
  }
}

export interface MockAgentOptions {
  /** Fail the first review for each working directory so retry loops can be exercised. */
  failFirstReview?: boolean;
}

export function createMockDriverRunner(options: MockAgentOptions = {}): DriverRunner {
  const reviewCounts = new Map<string, number>();
  return async (input: {
    persona: Persona;
    driver: DriverConfig;
    prompt: string;
    cwd: string;
    timeoutMs: number;
    dryRun?: boolean;
  }): Promise<Result<DriverOutput>> => {
    void input.driver;
    void input.prompt;
    void input.timeoutMs;
    void input.dryRun;
    let stdout = mockOutput(input.persona);
    if (input.persona === 'paranoid-reviewer' && options.failFirstReview) {
      const count = (reviewCounts.get(input.cwd) ?? 0) + 1;
      reviewCounts.set(input.cwd, count);
      if (count === 1) {
        stdout = `<abk_result>${JSON.stringify({
          status: 'fail',
          feedbackForRetry: 'Add input validation and handle the empty case, then retry.',
          issues: ['Missing input validation'],
          edge_cases: ['Empty input', 'Malformed input'],
        })}</abk_result>`;
      }
    }
    return ok({ stdout, stderr: '', exitCode: 0 });
  };
}

/**
 * Default mock runner used when no bridge driver is wired in.
 * It fails the first review per working directory so dry runs demonstrate the
 * Review -> Work retry loop instead of trivially passing.
 */
export const defaultMockDriverRunner: DriverRunner = createMockDriverRunner({ failFirstReview: true });
