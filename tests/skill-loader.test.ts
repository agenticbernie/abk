import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadSkillsFromDir, matchSkills, parseSkillFile } from '@abk/kernel';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'abk-skills-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('skill loader', () => {
  it('parses SKILL.md frontmatter and body', () => {
    const file = path.join(dir, 'SKILL.md');
    writeFileSync(file, `---\nname: demo\ndescription: Demo skill\ntriggers: ["bug", "fix"]\ndefault_persona: builder\nverify_required: true\n---\n\nBody text.\n`, 'utf8');
    const result = parseSkillFile(file);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe('demo');
      expect(result.value.triggers).toEqual(['bug', 'fix']);
      expect(result.value.body).toContain('Body text');
    }
  });

  it('loads skills from a directory and matches triggers', () => {
    const skillDir = path.join(dir, 'demo');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(path.join(skillDir, 'SKILL.md'), `---\nname: demo\ndescription: Demo skill\ntriggers: ["bug"]\n---\n\nBody.\n`, 'utf8');
    const loaded = loadSkillsFromDir(dir);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const matched = matchSkills('fix this bug', loaded.value);
    expect(matched.map((s) => s.name)).toContain('demo');
  });
});
