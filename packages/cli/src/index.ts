#!/usr/bin/env node

import { Command } from 'commander';
import { registerDoctor } from './commands/doctor.js';
import { registerInit } from './commands/init.js';
import { registerMemory } from './commands/memory.js';
import { registerPack } from './commands/pack.js';
import { registerReview } from './commands/review.js';
import { registerRun } from './commands/run.js';

const program = new Command();
program.name('abk').description('AgenticBernieKit multi-agent orchestrator').version('0.1.0');

registerInit(program);
registerRun(program);
registerReview(program);
registerMemory(program);
registerPack(program);
registerDoctor(program);

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
