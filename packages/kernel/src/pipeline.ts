import { type DriverConfig, type Persona, type Result } from './types.js';
import { loadConfig, resolvePath } from './config.js';
import { createGoldfishSession, filterElephantByScope, readElephantMemory } from './memory.js';
import { loadAllSkills, matchSkills } from './skill-loader.js';
import { expandGlobs, listFiles, type RunContext } from './context.js';
import { defaultMockDriverRunner } from './mock-agent.js';
import type { OrchestratorInput } from './types.js';

export function driverFor(ctx: RunContext, persona: Persona): DriverConfig {
  if (ctx.input.dryRun) return { driver: 'mock' };
  return ctx.config.persona_drivers[persona] ?? { driver: 'mock' };
}

/** Load config, skills, scoped memory, and a fresh Goldfish session for a run. */
export async function prepare(cwd: string, input: OrchestratorInput): Promise<Result<RunContext>> {
  const configResult = loadConfig(cwd);
  if (!configResult.ok) return { ok: false, error: configResult.error };
  const config = configResult.value;

  const session = createGoldfishSession(cwd, resolvePath(cwd, config.paths.session_dir));
  session.cleanup();

  const skillsResult = loadAllSkills({
    cwd,
    repoSkillsDir: resolvePath(cwd, config.paths.skills_dir),
    enabledPacks: config.packs_enabled,
  });
  if (!skillsResult.ok) return { ok: false, error: skillsResult.error };
  if (input.skillName && !skillsResult.value.some((skill) => skill.name === input.skillName)) {
    return {
      ok: false,
      error: `Skill not found: ${input.skillName}. Enable the pack that provides it (abk pack enable <pack>) or add .abk/skills/${input.skillName}/SKILL.md.`,
    };
  }

  let targetFiles = expandGlobs(cwd, input.files);
  if (targetFiles.length === 0) targetFiles = listFiles(cwd, 12);

  const memory = readElephantMemory(cwd, config);
  const memoryEntries = memory.ok ? filterElephantByScope(memory.value, targetFiles) : [];

  return {
    ok: true,
    value: {
      cwd,
      goal: input.goal,
      config,
      input,
      session,
      skills: skillsResult.value,
      matchedSkills: matchSkills(input.goal, skillsResult.value, input.skillName),
      targetFiles,
      memoryEntries,
    },
  };
}

/** Invoke one persona through the configured driver (or the mock fallback). */
export async function invoke(
  ctx: RunContext,
  persona: Persona,
  prompt: string,
  attempt?: number,
): Promise<Result<{ stdout: string }>> {
  const runner = ctx.input.driverRunner ?? defaultMockDriverRunner;
  const result = await runner({
    persona,
    driver: driverFor(ctx, persona),
    prompt,
    cwd: ctx.cwd,
    timeoutMs: ctx.config.command_timeout_ms,
    dryRun: ctx.input.dryRun,
    attempt,
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, value: { stdout: result.value.stdout } };
}
