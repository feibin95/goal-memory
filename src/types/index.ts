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

// 表单校验 schema：不带默认值，react-hook-form 要求 input/output 类型一致
export const goalDetailSchema = z.object({
  title:            z.string().min(1, '标题不能为空'),
  background:       z.string().min(1, '背景问题不能为空'),
  success_criteria: z.string(),
  status:           GoalStatusSchema,
  cost:             z.number().int().min(1).max(10),
  ddl:              z.string().nullable(),
  notes:            z.array(z.string()),
});
export type GoalDetailFormValues = z.infer<typeof goalDetailSchema>;

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

export const attemptSchema = z.object({
  hypothesis: z.string().min(1, '假设不能为空'),
  action:     z.string().min(1, '行动不能为空'),
  result:     z.string().min(1, '结果不能为空'),
  gradient:   z.number().nullable(),
});
export type AttemptFormValues = z.infer<typeof attemptSchema>;

export const KBEntrySchema = z.object({
  id:         z.string(),
  title:      z.string(),
  body:       z.string(),
  tags:       z.array(z.string()).default([]),
  created_at: z.string(),
});
export type KBEntry = z.infer<typeof KBEntrySchema>;

export interface GoalSummary {
  id: string;
  title: string;
  status: GoalStatus;
  parent_ids: string[];
  dependencies: string[];
  created_at: string;
}

export type GoalDetail = Goal & { attempts: Attempt[] };

export interface AppState {
  goals: Record<string, GoalSummary>;
}
