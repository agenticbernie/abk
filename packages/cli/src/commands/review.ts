import type { Command } from 'commander';
import { gitDiff, reviewDiff } from '@abk/kernel';
import { runDriver } from '@abk/bridge';
import { readPacket } from '../utils.js';

export function registerReview(program: Command): void {
  program
    .command('review')
    .description('Review the current uncommitted git diff')
    .option('--dry-run', 'Use mock drivers (no API tokens)')
    .action(async (options: { dryRun?: boolean }) => {
      const cwd = process.cwd();
      const diffResult = gitDiff(cwd);
      const diff = diffResult.ok ? diffResult.value : '';
      if (!diff.trim()) {
        console.log('No diff to review.');
        return;
      }

      const packet = readPacket(cwd);
      const result = await reviewDiff({
        cwd,
        goal: packet?.goal ?? 'Review current diff',
        diff,
        acceptanceCriteria: packet?.acceptanceCriteria ?? [],
        dryRun: options.dryRun,
        driverRunner: (input) => runDriver(input),
      });
      if (!result.ok) {
        console.error(result.error);
        process.exit(1);
      }

      const review = result.value;
      console.log(`Status: ${String(review.status ?? 'unknown')}`);
      if (review.feedbackForRetry) console.log(`Feedback: ${String(review.feedbackForRetry)}`);
      if (Array.isArray(review.issues) && review.issues.length > 0) {
        console.log(`Issues:\n${review.issues.map((issue) => `- ${String(issue)}`).join('\n')}`);
      }
      if (Array.isArray(review.edge_cases) && review.edge_cases.length > 0) {
        console.log(`Edge cases:\n${review.edge_cases.map((item) => `- ${String(item)}`).join('\n')}`);
      }
      process.exit(String(review.status).toLowerCase() === 'pass' ? 0 : 1);
    });
}
