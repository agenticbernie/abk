# AgenticBernieKit (`abk`)

Lean, event-driven harness engineering and cross-CLI multi-agent orchestration for daily
software engineering and sprint/hackathon execution.

`abk` separates **thinking modes** into five personas, keeps a durable **Elephant** memory of
repo invariants, and gives each task only a minimal **Goldfish** context packet. A four-phase
loop — **Plan → Work → Review → Compound** — turns each completed task into memory that makes
the next one cheaper and safer.

---

## Quickstart

Requires Node.js 20+, `pnpm`, and `git` (optional but recommended).

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck

# Use the built CLI
node packages/cli/dist/index.js doctor
node packages/cli/dist/index.js init
node packages/cli/dist/index.js run "Add input validation helper" --dry-run
```

`abk init` detects your stack, writes `.abk/config.yaml`, creates an empty
`.abk/memory.jsonl`, and adds `.abk/session/` plus `.abk/checkpoints/` to `.gitignore`.

Link the binary if you want `abk` on your `PATH`:

```bash
pnpm --filter @abk/cli link --global   # then: abk doctor
```

---

## Architecture

```text
                      ┌──────────────────────────────────────────┐
                      │                 abk run                  │
                      └───────────────────┬──────────────────────┘
                                          │
        ┌─────────────────────────────────▼─────────────────────────────────┐
        │  PLAN (architect)                                                 │
        │  goal + scoped Elephant rules + skills + target files             │
        │  -> plan, acceptance criteria, target files                       │
        └─────────────────────────────────┬─────────────────────────────────┘
                                          │
              ┌───────────────────────────▼───────────────────────────┐
              │  WORK (builder)                                       │
              │  minimal Goldfish packet -> edits                     │
              │  -> verify_commands -> git checkpoint                 │
              └───────────────────────────┬───────────────────────────┘
                                          │
              ┌───────────────────────────▼───────────────────────────┐
              │  REVIEW (paranoid-reviewer)                           │
              │  git diff vs acceptance criteria + edge cases         │
              │  pass -> continue   fail -> retry Work (max_review_loops) │
              └───────────────────────────┬───────────────────────────┘
                                          │
              ┌───────────────────────────▼───────────────────────────┐
              │  COMPOUND (distiller)                                 │
              │  verified lessons -> dedupe -> .abk/memory.jsonl      │
              └───────────────────────────────────────────────────────┘
```

Packages:

| Package | Responsibility |
| --- | --- |
| `@abk/kernel` | Zod schemas, config, Elephant/Goldfish memory, `SKILL.md` loader, git checkpoints, deterministic verifier, orchestration state machine |
| `@abk/bridge` | Persona prompts, `<abk_result>` parser with JSON repair, subprocess drivers for external CLIs plus mock/custom drivers |
| `@abk/cli` | The `abk` binary |

The kernel and bridge return explicit `Result` objects (`{ ok: true, value }` or
`{ ok: false, error }`) instead of throwing across module boundaries.

---

## The five personas

| Persona | Job | Never does |
| --- | --- | --- |
| `architect` | Plan, define acceptance criteria, pick target files | Edit code |
| `builder` | Make the smallest correct change | Grade its own work |
| `paranoid-reviewer` | Audit the diff against criteria and edge cases | Rewrite the feature |
| `qa-runner` | Design deterministic checks and diagnostics | Merge code |
| `distiller` | Extract durable, deduplicated lessons | Plan new work |

---

## Elephant and Goldfish memory

**Elephant** (`.abk/memory.jsonl`) is append-only, human-readable JSONL. Each line is validated by
`ElephantEntrySchema`:

```json
{"id":"...","timestamp":"2026-01-01T00:00:00.000Z","category":"gotcha","scope":"packages/api/*","content":"Route handlers must validate before hitting the DB.","author":"user"}
```

- `category`: `invariant` | `gotcha` | `pattern` | `decision`
- `scope`: a glob (`packages/api/*`) or `global`
- Entries are filtered to the files in the current task; duplicates are rejected on append and
  collapsed by `abk memory prune`.
- Compound-phase lessons are written only after a passing review.

**Goldfish** (`.abk/session/`) is the scratch context for the active task:

| File | Contents |
| --- | --- |
| `current-plan.md` | Plan and acceptance criteria from the architect |
| `packet.json` | Goal, target files, diff, `lastErrorLog`, checkpoint id |
| `diff-audit.json` | Per-attempt diff and verification report |

The session is wiped at the start of each run and again on success. `abk plan` keeps the plan so
you can inspect or feed it into another tool.

Checkpoints are lightweight git stash objects plus a `.patch` and `.json` record under
`.abk/checkpoints/`, taken after Work and before Review. Non-git directories are recorded but not
stashed.

---

## CLI

| Command | Description |
| --- | --- |
| `abk init [--pack <name>]` | Detect stack, infer verify commands, write config, memory, and `.gitignore` entries |
| `abk run "<goal>" [--skill <name>] [--files <glob>] [--dry-run] [--no-compound]` | Full Plan → Work → Review → Compound loop |
| `abk plan "<goal>" [--skill <name>] [--files <glob>] [--dry-run]` | Architect only; writes `.abk/session/current-plan.md` |
| `abk review [--dry-run]` | Paranoid review of the current uncommitted `git diff` |
| `abk memory list [--scope <glob>] [--category <cat>]` | List Elephant entries |
| `abk memory add "<rule>" [--scope <glob>] [--category <cat>]` | Add an entry (duplicates skipped) |
| `abk memory prune` | Remove duplicates |
| `abk pack list` | List built-in and local packs, marking enabled ones |
| `abk pack enable <name>` / `abk pack use <name>` | Enable a pack in `.abk/config.yaml` |
| `abk doctor` | Report installed CLI binaries and per-persona routing |

`--dry-run` forces the mock driver for every persona, so the whole pipeline runs offline with no
API tokens. The mock pipeline fails its first review on purpose, demonstrating the retry loop.

Stack detection covers `package.json`, `Cargo.toml`, `pyproject.toml`, `build.zig`, and `Move.toml`.
For Node projects, `test`, `build`, `typecheck`, and `lint` scripts become `verify_commands` using
`pnpm` when `pnpm-lock.yaml` exists, otherwise `npm`.

---

## Configuration (`.abk/config.yaml`)

```yaml
version: 1
project_name: my-project
stack: node
verify_commands:
  - pnpm test
  - pnpm run build
max_review_loops: 2            # Work retries after a failed review
command_timeout_ms: 120000
active_pack: daily-eng
packs_enabled:
  - daily-eng
persona_drivers:
  architect:          { driver: claude }
  builder:            { driver: claude }
  paranoid-reviewer:  { driver: claude }
  qa-runner:          { driver: claude }
  distiller:          { driver: claude }
paths:
  abk_dir: .abk
  memory_file: .abk/memory.jsonl
  session_dir: .abk/session
  checkpoints_dir: .abk/checkpoints
  skills_dir: .abk/skills
```

Every field is validated with Zod; missing fields fall back to defaults.

### Drivers

| `driver` | Invocation |
| --- | --- |
| `claude` | `claude -p <prompt>` |
| `codex` | `codex exec <prompt>` |
| `gemini` | `gemini -p <prompt>` |
| `opencode` | `opencode run <prompt>` |
| `freebuff` | `freebuff <prompt>` |
| `mock` | Deterministic offline responses |
| `custom` | Shell template containing `{{prompt}}`, or a command that receives the prompt on stdin |

Example custom driver:

```yaml
persona_drivers:
  architect:
    driver: custom
    command: my-llm --system architect --prompt "{{prompt}}"
```

Each persona can route to a different CLI, e.g. Claude for planning, Codex for building, and a
local model for distilling.

### Output contract

Every driver must end with:

```text
<abk_result>{"status":"pass","issues":[]}</abk_result>
```

`@abk/bridge` extracts the payload, tolerates surrounding prose and code fences, and repairs
common malformed JSON (trailing commas, unquoted keys, single quotes).

---

## Skills

A skill is one `SKILL.md` file with YAML frontmatter and a Markdown body:

```markdown
---
name: root-cause-debugger
description: Reproduce, isolate, and minimally fix bugs with regression tests.
triggers: ["bug", "fix", "debug", "crash", "error", "trace"]
default_persona: paranoid-reviewer
verify_required: true
---

1. Reproduce the failure.
2. Isolate the smallest failing unit.
3. Fix the root cause and add a regression test.
```

Skills are loaded from `.abk/skills/` (repo-local, wins on name conflict) and from enabled packs.
A skill is injected into the architect and builder prompts when the goal matches a trigger, or when
`--skill <name>` is passed. Adding a skill needs no code and no registration.

### Built-in packs

| Pack | Skills |
| --- | --- |
| `daily-eng` | `feature-builder`, `root-cause-debugger`, `arch-reviewer`, `pr-guardian` |
| `sprint` | `rapid-mvp-scoper`, `demo-pitch-builder`, `judge-simulator` |

```bash
abk init --pack sprint
abk pack enable daily-eng
abk run "debug the flaky checkout test" --skill root-cause-debugger
```

`abk pack list` discovers packs from the nearest `packs/` directory up the tree, so local packs can
live beside your project too.

---

## Repository layout

```text
├── packages/
│   ├── kernel/src/   types config memory skill-loader checkpoint verifier context prompts
│   │                 pipeline single-phase mock-agent orchestrator
│   ├── bridge/src/   personas parser drivers
│   └── cli/src/      index utils commands/{init,run,review,memory,pack,doctor}
├── packs/{daily-eng,sprint}/skills/*/SKILL.md
└── tests/            memory parser skill-loader orchestrator.e2e
```

## Testing

```bash
pnpm test        # vitest: memory scope/dedupe/Goldfish, parser repair, skills, full e2e loop
pnpm typecheck   # all packages + tests
pnpm build       # tsup ESM bundles and .d.ts files
```

The e2e test runs the full loop with the mock driver, asserts the Review → Work retry happened,
and verifies the Compound phase appended memory.
