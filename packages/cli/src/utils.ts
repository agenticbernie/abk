import path from 'node:path';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  defaultPackRoots,
  loadConfig,
  resolvePath,
  saveConfig,
  type AbkConfig,
  type ElephantCategory,
  type GoldfishPacket,
} from '@abk/kernel';

export const CATEGORIES = new Set<ElephantCategory>(['invariant', 'gotcha', 'pattern', 'decision']);

export function binaryExists(binary: string): boolean {
  const probe = process.platform === 'win32' ? 'where' : 'which';
  return spawnSync(probe, [binary], { stdio: 'ignore' }).status === 0;
}

export function printProgress(event: { phase?: string; message: string }): void {
  console.log(`${event.phase ? `[${event.phase}]` : '[info]'} ${event.message}`);
}

export function requireConfig(cwd: string): AbkConfig {
  const result = loadConfig(cwd);
  if (!result.ok) {
    console.error(result.error);
    process.exit(1);
  }
  return result.value;
}

export function writeConfig(cwd: string, config: AbkConfig): void {
  const result = saveConfig(cwd, config);
  if (!result.ok) {
    console.error(result.error);
    process.exit(1);
  }
}

export function detectStack(cwd: string): { stack: string; verifyCommands: string[] } {
  const packagePath = path.resolve(cwd, 'package.json');
  if (existsSync(packagePath)) {
    const verifyCommands: string[] = [];
    try {
      const pkg = JSON.parse(readFileSync(packagePath, 'utf8')) as { scripts?: Record<string, string> };
      const runner = existsSync(path.resolve(cwd, 'pnpm-lock.yaml')) ? 'pnpm' : 'npm';
      if (pkg.scripts?.test) verifyCommands.push(`${runner} test`);
      if (pkg.scripts?.build) verifyCommands.push(`${runner} run build`);
      if (pkg.scripts?.typecheck) verifyCommands.push(`${runner} run typecheck`);
      if (pkg.scripts?.lint) verifyCommands.push(`${runner} run lint`);
    } catch {
      // A malformed package.json should not block init.
    }
    return { stack: 'node', verifyCommands };
  }

  const markers: Array<{ marker: string; stack: string; commands: string[] }> = [
    { marker: 'Cargo.toml', stack: 'rust', commands: ['cargo test'] },
    { marker: 'pyproject.toml', stack: 'python', commands: ['pytest'] },
    { marker: 'build.zig', stack: 'zig', commands: ['zig build test'] },
    { marker: 'Move.toml', stack: 'move', commands: ['sui move build'] },
  ];
  for (const entry of markers) {
    if (existsSync(path.resolve(cwd, entry.marker))) {
      return { stack: entry.stack, verifyCommands: entry.commands };
    }
  }
  return { stack: 'unknown', verifyCommands: [] };
}

export function updateGitignore(cwd: string): void {
  const gitignorePath = path.resolve(cwd, '.gitignore');
  const existing = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf8') : '';
  const lines = existing.split(/\r?\n/);
  const additions = ['.abk/session/', '.abk/checkpoints/'].filter((entry) => !lines.includes(entry));
  if (additions.length === 0) return;
  const prefix = existing === '' || existing.endsWith('\n') ? existing : `${existing}\n`;
  writeFileSync(gitignorePath, `${prefix}${additions.join('\n')}\n`, 'utf8');
}

export function discoverPacks(cwd: string): string[] {
  const names = new Set<string>();
  for (const root of defaultPackRoots(cwd)) {
    if (!existsSync(root)) continue;
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (entry.isDirectory()) names.add(entry.name);
    }
  }
  return [...names].sort();
}

export function readPacket(cwd: string): GoldfishPacket | null {
  const config = loadConfig(cwd);
  if (!config.ok) return null;
  const packetPath = resolvePath(cwd, config.value.paths.session_dir);
  const full = path.join(packetPath, 'packet.json');
  if (!existsSync(full)) return null;
  try {
    return JSON.parse(readFileSync(full, 'utf8')) as GoldfishPacket;
  } catch {
    return null;
  }
}
