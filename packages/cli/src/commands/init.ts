import path from 'node:path';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import type { Command } from 'commander';
import { defaultConfig, resolvePath } from '@abk/kernel';
import { binaryExists, detectStack, discoverPacks, updateGitignore, writeConfig } from '../utils.js';

export function registerInit(program: Command): void {
  program
    .command('init')
    .description('Initialize .abk in the current project')
    .option('--pack <pack>', 'Enable a built-in skill pack')
    .action((options: { pack?: string }) => {
      const cwd = process.cwd();
      const abkDir = path.resolve(cwd, '.abk');
      for (const dir of ['skills', 'session', 'checkpoints']) {
        mkdirSync(path.resolve(abkDir, dir), { recursive: true });
      }

      const { stack, verifyCommands } = detectStack(cwd);
      const driver = binaryExists('claude') ? ('claude' as const) : ('mock' as const);
      const drivers = {
        architect: { driver },
        builder: { driver },
        'paranoid-reviewer': { driver },
        'qa-runner': { driver },
        distiller: { driver },
      };

      if (options.pack && !discoverPacks(cwd).includes(options.pack)) {
        console.warn(`Warning: pack "${options.pack}" was not found; enabling it anyway.`);
      }

      const config = defaultConfig({
        projectName: path.basename(cwd),
        stack,
        verifyCommands,
        activePack: options.pack ?? null,
        drivers,
      });
      writeConfig(cwd, config);

      const memoryPath = resolvePath(cwd, config.paths.memory_file);
      if (!existsSync(memoryPath)) writeFileSync(memoryPath, '', 'utf8');
      updateGitignore(cwd);

      console.log(`Initialized .abk (stack: ${stack})`);
      console.log(`Verify commands: ${verifyCommands.join(', ') || 'none detected'}`);
      console.log(`Driver: ${driver}${driver === 'mock' ? ' (install claude for real runs)' : ''}`);
      if (options.pack) console.log(`Enabled pack: ${options.pack}`);
    });
}
