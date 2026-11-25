import type { Command } from 'commander';
import { loadConfig } from '@abk/kernel';
import { binaryExists } from '../utils.js';

const BINARIES = ['claude', 'codex', 'gemini', 'opencode', 'freebuff', 'git', 'pnpm', 'node'];

export function registerDoctor(program: Command): void {
  program
    .command('doctor')
    .description('Check installed CLI binaries and routing targets')
    .action(() => {
      for (const binary of BINARIES) {
        console.log(`${binary}: ${binaryExists(binary) ? 'installed' : 'missing'}`);
      }

      const configResult = loadConfig(process.cwd());
      if (!configResult.ok) {
        console.log('\nNo .abk config yet; run "abk init" to configure routing.');
        return;
      }

      const { persona_drivers: drivers } = configResult.value;
      console.log('\nPersona routing:');
      for (const [persona, driver] of Object.entries(drivers)) {
        const available =
          driver.driver === 'mock' || driver.driver === 'custom' || binaryExists(driver.driver);
        console.log(`${persona}: ${driver.driver}${available ? '' : ' (binary missing)'}`);
      }
    });
}
