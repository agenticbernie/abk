import type { Command } from 'commander';
import { runOrchestrator, runPlan } from '@abk/kernel';
import { runDriver } from '@abk/bridge';
import { printProgress } from '../utils.js';

interface GoalOptions {
  skill?: string;
  files?: string;
  dryRun?: boolean;
}

export function registerRun(program: Command): void {
  program
    .command('run')
    .description('Run the full Plan -> Work -> Review -> Compound loop')
    .argument('<goal>', 'Task goal')
    .option('--skill <name>', 'Force a specific skill')
    .option('--files <glob>', 'Restrict context to a glob')
    .option('--dry-run', 'Use mock drivers (no API tokens)')
    .option('--no-compound', 'Skip the compound phase')
    .action(
      async (goal: string, options: GoalOptions & { compound?: boolean }) => {
        const result = await runOrchestrator({
          cwd: process.cwd(),
          goal,
          skillName: options.skill,
          files: options.files ? [options.files] : undefined,
          dryRun: options.dryRun,
          noCompound: options.compound === false,
          onProgress: printProgress,
          driverRunner: (input) => runDriver(input),
        });
        console.log(`\nRun ${result.ok ? 'PASSED' : 'FAILED'}: ${result.goal}`);
        if (result.lessonsAdded > 0) {
          console.log(`Lessons added to Elephant memory: ${result.lessonsAdded}`);
        }
        if (result.error) console.error(result.error);
        process.exit(result.ok ? 0 : 1);
      },
    );

  program
    .command('plan')
    .description('Run only the architect phase')
    .argument('<goal>', 'Task goal')
    .option('--skill <name>', 'Force a specific skill')
    .option('--files <glob>', 'Restrict context to a glob')
    .option('--dry-run', 'Use mock drivers (no API tokens)')
    .action(async (goal: string, options: GoalOptions) => {
      const result = await runPlan({
        cwd: process.cwd(),
        goal,
        skillName: options.skill,
        files: options.files ? [options.files] : undefined,
        dryRun: options.dryRun,
        driverRunner: (input) => runDriver(input),
      });
      if (!result.ok) {
        console.error(result.error);
        process.exit(1);
      }
      console.log(result.value.plan);
      console.log('\nAcceptance criteria:');
      for (const criterion of result.value.acceptanceCriteria) console.log(`- ${criterion}`);
    });
}
