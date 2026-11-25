import type { Command } from 'commander';
import { loadConfig } from '@abk/kernel';
import { discoverPacks, requireConfig, writeConfig } from '../utils.js';

export function registerPack(program: Command): void {
  const pack = program.command('pack').description('Manage skill packs');

  pack
    .command('list')
    .description('List available packs')
    .action(() => {
      const cwd = process.cwd();
      const configResult = loadConfig(cwd);
      const enabled = configResult.ok ? configResult.value.packs_enabled : [];
      const packs = discoverPacks(cwd);
      if (packs.length === 0) {
        console.log('No packs found.');
        return;
      }
      for (const name of packs) {
        console.log(`${name}${enabled.includes(name) ? ' (enabled)' : ''}`);
      }
    });

  const enable = (packName: string): void => {
    const cwd = process.cwd();
    const config = requireConfig(cwd);
    if (!config.packs_enabled.includes(packName)) config.packs_enabled.push(packName);
    config.active_pack = packName;
    writeConfig(cwd, config);
    console.log(`Enabled pack: ${packName}`);
  };

  for (const name of ['enable', 'use'] as const) {
    pack
      .command(name)
      .description('Enable a skill pack')
      .argument('<pack-name>', 'Pack name')
      .action((packName: string) => enable(packName));
  }
}
