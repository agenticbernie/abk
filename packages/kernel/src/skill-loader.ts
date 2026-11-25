import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'yaml';
import { SkillDefSchema, type SkillDef, type Result } from './types.js';

export function parseSkillFile(filePath: string, pack?: string): Result<SkillDef> {
  try {
    const raw = readFileSync(filePath, 'utf8');
    const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!match) {
      return { ok: false, error: `Skill file missing YAML frontmatter: ${filePath}` };
    }
    const frontmatter = yaml.parse(match[1]) ?? {};
    const body = match[2].trim();
    const parsed = SkillDefSchema.parse({
      ...frontmatter,
      body,
      sourcePath: filePath,
      pack,
    });
    return { ok: true, value: parsed };
  } catch (error) {
    return { ok: false, error: `Failed to parse skill ${filePath}: ${error instanceof Error ? error.message : String(error)}` };
  }
}

function collectSkillFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const result: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...collectSkillFiles(full));
    } else if (entry.isFile() && entry.name === 'SKILL.md') {
      result.push(full);
    }
  }
  return result.sort();
}

export function loadSkillsFromDir(dir: string, pack?: string): Result<SkillDef[]> {
  const files = collectSkillFiles(dir);
  const skills: SkillDef[] = [];
  for (const file of files) {
    const parsed = parseSkillFile(file, pack);
    if (!parsed.ok) return parsed;
    skills.push(parsed.value);
  }
  return { ok: true, value: skills };
}

export function defaultPackRoots(cwd: string): string[] {
  const roots = new Set<string>();
  // Repo-local packs take precedence, then ancestors of the project.
  let cursor = path.resolve(cwd);
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = path.join(cursor, 'packs');
    if (existsSync(candidate)) roots.add(candidate);
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  // Packs shipped beside this module (monorepo/package install).
  const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  roots.add(path.join(moduleRoot, 'packs'));
  return [...roots];
}

export function loadAllSkills(input: {
  cwd: string;
  repoSkillsDir: string;
  enabledPacks: string[];
  packRoots?: string[];
}): Result<SkillDef[]> {
  const repoDir = path.isAbsolute(input.repoSkillsDir)
    ? input.repoSkillsDir
    : path.resolve(input.cwd, input.repoSkillsDir);

  // Pack skills load first so repo-local skills of the same name override them.
  const skills: SkillDef[] = [];
  const roots = input.packRoots ?? defaultPackRoots(input.cwd);
  for (const packName of input.enabledPacks) {
    for (const root of roots) {
      const packSkillsDir = path.join(root, packName, 'skills');
      if (!existsSync(packSkillsDir)) continue;
      const result = loadSkillsFromDir(packSkillsDir, packName);
      if (!result.ok) return result;
      skills.push(...result.value);
    }
  }
  const repoResult = loadSkillsFromDir(repoDir);
  if (!repoResult.ok) return repoResult;
  skills.push(...repoResult.value);

  // De-duplicate by name, later wins (repo-local skills are appended last).
  const byName = new Map<string, SkillDef>();
  for (const skill of skills) byName.set(skill.name, skill);
  return { ok: true, value: [...byName.values()] };
}

export function matchSkills(goal: string, skills: SkillDef[], requested?: string): SkillDef[] {
  const matched: SkillDef[] = [];
  if (requested) {
    const exact = skills.find((skill) => skill.name === requested);
    if (exact) matched.push(exact);
  }
  const lowerGoal = goal.toLowerCase();
  for (const skill of skills) {
    if (requested && skill.name === requested) continue;
    if (skill.triggers.some((trigger) => lowerGoal.includes(trigger.toLowerCase()))) {
      matched.push(skill);
    }
  }
  return matched;
}

export function formatSkillsForPrompt(skills: SkillDef[]): string {
  if (skills.length === 0) return 'No matching skills.';
  return skills
    .map((skill) => `### Skill: ${skill.name}\n${skill.description}\n\n${skill.body}`)
    .join('\n\n---\n\n');
}
