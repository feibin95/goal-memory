import { z } from 'zod';

export const GoalStatusSchema = z.enum(['ready', 'in_progress', 'done']);
export type GoalStatus = z.infer<typeof GoalStatusSchema>;

export const GoalSchema = z.object({
  id:               z.string(),
  title:            z.string(),
  background:       z.string().default(''),
  parent_ids:       z.array(z.string()).default([]),
  dependencies:     z.array(z.string()).default([]),
  status:           GoalStatusSchema.default('ready'),
  cost:             z.number().int().default(3),
  ddl:              z.string().nullable().default(null),
  success_criteria: z.string().default(''),
  notes:            z.array(z.string()).default([]),
  created_at:       z.string(),
  updated_at:       z.string(),
});
export type Goal = z.infer<typeof GoalSchema>;

export const AttemptSchema = z.object({
  id:         z.string(),
  goal_id:    z.string(),
  hypothesis: z.string(),
  action:     z.string(),
  result:     z.string(),
  gradient:   z.number().nullable().default(null),
  created_at: z.string(),
});
export type Attempt = z.infer<typeof AttemptSchema>;

export const KBEntrySchema = z.object({
  id:         z.string(),
  title:      z.string(),
  body:       z.string(),
  tags:       z.array(z.string()).default([]),
  created_at: z.string(),
});
export type KBEntry = z.infer<typeof KBEntrySchema>;

export interface AppState {
  goals: Record<string, Goal>;
  attempts: Attempt[];
  kb: KBEntry[];
  storagePath: string;
}
