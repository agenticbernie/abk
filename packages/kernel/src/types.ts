import { z } from 'zod';

export type Result<T, E = string> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const err = <E = string>(error: E): Result<never, E> => ({ ok: false, error });

export const PersonaSchema = z.enum([
  'architect',
  'builder',
  'paranoid-reviewer',
  'qa-runner',
  'distiller',
]);
export type Persona = z.infer<typeof PersonaSchema>;

export const DriverTypeSchema = z.enum([
  'claude',
  'codex',
  'gemini',
  'opencode',
  'freebuff',
  'custom',
  'mock',
]);
export type DriverType = z.infer<typeof DriverTypeSchema>;

export const DriverConfigSchema = z.object({
  driver: DriverTypeSchema,
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  model: z.string().optional(),
  timeout_ms: z.number().int().positive().optional(),
});
export type DriverConfig = z.infer<typeof DriverConfigSchema>;

export const ElephantCategorySchema = z.enum(['invariant', 'gotcha', 'pattern', 'decision']);
export type ElephantCategory = z.infer<typeof ElephantCategorySchema>;

export const ElephantEntrySchema = z.object({
  id: z.string().min(1),
  timestamp: z.string(),
  category: ElephantCategorySchema,
  scope: z.string().min(1),
  title: z.string().optional(),
  content: z.string().min(1),
  tags: z.array(z.string()).optional(),
  author: z.enum(['agent', 'user', 'system']).optional(),
});
export type ElephantEntry = z.infer<typeof ElephantEntrySchema>;

export const GoldfishPacketSchema = z.object({
  goal: z.string(),
  files: z.array(z.string()),
  diff: z.string().optional(),
  lastErrorLog: z.string().optional(),
  acceptanceCriteria: z.array(z.string()).optional(),
  plan: z.string().optional(),
  checkpoint: z.string().optional(),
  startedAt: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type GoldfishPacket = z.infer<typeof GoldfishPacketSchema>;

export const SkillDefSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(''),
  triggers: z.array(z.string()).default([]),
  default_persona: PersonaSchema.optional(),
  verify_required: z.boolean().default(false),
  body: z.string().default(''),
  sourcePath: z.string(),
  pack: z.string().optional(),
});
export type SkillDef = z.infer<typeof SkillDefSchema>;

export const VerificationResultSchema = z.object({
  command: z.string(),
  exitCode: z.number().int(),
  stdout: z.string(),
  stderr: z.string(),
  durationMs: z.number().int().nonnegative(),
  timedOut: z.boolean().default(false),
});
export type VerificationResult = z.infer<typeof VerificationResultSchema>;

export const VerificationReportSchema = z.object({
  results: z.array(VerificationResultSchema),
  allPassed: z.boolean(),
});
export type VerificationReport = z.infer<typeof VerificationReportSchema>;

export const PhaseNameSchema = z.enum(['plan', 'work', 'review', 'compound']);
export type PhaseName = z.infer<typeof PhaseNameSchema>;

export const StepResultSchema = z.object({
  phase: PhaseNameSchema,
  ok: z.boolean(),
  output: z.string(),
  parsed: z.record(z.string(), z.unknown()).optional(),
  durationMs: z.number().int().nonnegative(),
  error: z.string().optional(),
});
export type StepResult = z.infer<typeof StepResultSchema>;

export const AbkConfigSchema = z.object({
  version: z.number().int().default(1),
  project_name: z.string().optional(),
  stack: z.string().optional(),
  verify_commands: z.array(z.string()).default([]),
  max_review_loops: z.number().int().positive().default(2),
  command_timeout_ms: z.number().int().positive().default(120000),
  active_pack: z.string().nullable().default(null),
  packs_enabled: z.array(z.string()).default([]),
  persona_drivers: z.record(PersonaSchema, DriverConfigSchema).default({
    architect: { driver: 'mock' },
    builder: { driver: 'mock' },
    'paranoid-reviewer': { driver: 'mock' },
    'qa-runner': { driver: 'mock' },
    distiller: { driver: 'mock' },
  }),
  paths: z.object({
    abk_dir: z.string().default('.abk'),
    memory_file: z.string().default('.abk/memory.jsonl'),
    session_dir: z.string().default('.abk/session'),
    checkpoints_dir: z.string().default('.abk/checkpoints'),
    skills_dir: z.string().default('.abk/skills'),
  }).default({}),
});
export type AbkConfig = z.infer<typeof AbkConfigSchema>;

export interface OrchestratorInput {
  cwd: string;
  goal: string;
  skillName?: string;
  files?: string[];
  dryRun?: boolean;
  noCompound?: boolean;
  onProgress?: (event: ProgressEvent) => void;
  driverRunner?: DriverRunner;
}

export interface DriverOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type DriverRunner = (input: {
  persona: Persona;
  driver: DriverConfig;
  prompt: string;
  cwd: string;
  timeoutMs: number;
  dryRun?: boolean;
  /** Zero-based review attempt for pipeline runs; omitted for standalone reviews. */
  attempt?: number;
}) => Promise<Result<DriverOutput>>;

export const OrchestratorResultSchema = z.object({
  ok: z.boolean(),
  goal: z.string(),
  phases: z.array(StepResultSchema),
  lessonsAdded: z.number().int().nonnegative().default(0),
  error: z.string().optional(),
});
export type OrchestratorResult = z.infer<typeof OrchestratorResultSchema>;

export interface ProgressEvent {
  type: 'phase_start' | 'phase_end' | 'info' | 'error';
  phase?: PhaseName;
  message: string;
}
