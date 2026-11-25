import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import yaml from 'yaml';
import { AbkConfigSchema, type AbkConfig, type Result } from './types.js';

export function abkDir(cwd: string, config?: AbkConfig): string {
  return path.resolve(cwd, config?.paths.abk_dir ?? '.abk');
}

export function loadConfig(cwd: string): Result<AbkConfig> {
  const configPath = path.resolve(cwd, '.abk', 'config.yaml');
  if (!existsSync(configPath)) {
    return { ok: false, error: `Config not found: ${configPath}. Run "abk init" first.` };
  }
  try {
    const raw = readFileSync(configPath, 'utf8');
    const parsed = yaml.parse(raw) ?? {};
    const validated = AbkConfigSchema.parse(parsed);
    return { ok: true, value: validated };
  } catch (error) {
    return { ok: false, error: `Invalid config: ${error instanceof Error ? error.message : String(error)}` };
  }
}

export function saveConfig(cwd: string, config: AbkConfig): Result<void> {
  const dir = path.resolve(cwd, '.abk');
  mkdirSync(dir, { recursive: true });
  const configPath = path.resolve(dir, 'config.yaml');
  try {
    writeFileSync(configPath, yaml.stringify(config), 'utf8');
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: `Failed to write config: ${error instanceof Error ? error.message : String(error)}` };
  }
}

export function defaultConfig(input: {
  projectName?: string;
  stack?: string;
  verifyCommands?: string[];
  activePack?: string | null;
  drivers?: AbkConfig['persona_drivers'];
}): AbkConfig {
  return AbkConfigSchema.parse({
    version: 1,
    project_name: input.projectName,
    stack: input.stack,
    verify_commands: input.verifyCommands ?? [],
    max_review_loops: 2,
    command_timeout_ms: 120000,
    active_pack: input.activePack ?? null,
    packs_enabled: input.activePack ? [input.activePack] : [],
    persona_drivers: input.drivers ?? {
      architect: { driver: 'mock' },
      builder: { driver: 'mock' },
      'paranoid-reviewer': { driver: 'mock' },
      'qa-runner': { driver: 'mock' },
      distiller: { driver: 'mock' },
    },
    paths: {},
  });
}

export function resolvePath(cwd: string, configured: string): string {
  return path.isAbsolute(configured) ? configured : path.resolve(cwd, configured);
}
