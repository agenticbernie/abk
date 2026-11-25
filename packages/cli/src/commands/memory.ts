import type { Command } from 'commander';
import { randomUUID } from 'node:crypto';
import {
  appendElephantEntry,
  pruneElephantMemory,
  readElephantMemory,
  type ElephantCategory,
} from '@abk/kernel';
import { CATEGORIES, requireConfig } from '../utils.js';

export function registerMemory(program: Command): void {
  const memory = program.command('memory').description('Manage Elephant memory');

  memory
    .command('list')
    .description('List memory entries')
    .option('--scope <glob>', 'Filter by exact scope')
    .option('--category <category>', 'Filter by category')
    .action((options: { scope?: string; category?: string }) => {
      const cwd = process.cwd();
      const config = requireConfig(cwd);
      const result = readElephantMemory(cwd, config);
      if (!result.ok) {
        console.error(result.error);
        process.exit(1);
      }
      const entries = result.value.filter(
        (entry) =>
          (!options.scope || entry.scope === options.scope) &&
          (!options.category || entry.category === options.category),
      );
      for (const entry of entries) {
        console.log(`[${entry.id.slice(0, 8)}] ${entry.category} | ${entry.scope} | ${entry.content}`);
      }
      console.log(
        entries.length === 0
          ? 'No memory entries.'
          : `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}.`,
      );
    });

  memory
    .command('add')
    .description('Add a memory entry')
    .argument('<rule>', 'Rule, invariant, gotcha, or decision')
    .option('--scope <glob>', 'Scope glob (default: global)', 'global')
    .option('--category <category>', 'invariant | gotcha | pattern | decision', 'gotcha')
    .action((rule: string, options: { scope?: string; category?: string }) => {
      const cwd = process.cwd();
      const config = requireConfig(cwd);
      const category = (options.category ?? 'gotcha') as ElephantCategory;
      if (!CATEGORIES.has(category)) {
        console.error(`Invalid category "${category}". Use one of: ${[...CATEGORIES].join(', ')}`);
        process.exit(1);
      }
      const result = appendElephantEntry(cwd, config, {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        category,
        scope: options.scope ?? 'global',
        content: rule,
        author: 'user',
      });
      if (!result.ok) {
        console.error(result.error);
        process.exit(1);
      }
      console.log(result.value.added ? 'Memory added.' : 'Duplicate memory entry skipped.');
    });

  memory
    .command('prune')
    .description('Remove duplicate memory entries')
    .action(() => {
      const cwd = process.cwd();
      const config = requireConfig(cwd);
      const result = pruneElephantMemory(cwd, config);
      if (!result.ok) {
        console.error(result.error);
        process.exit(1);
      }
      console.log(`Pruned ${result.value.removed} duplicate(s); ${result.value.kept} kept.`);
    });
}
