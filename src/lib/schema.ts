import { z } from 'zod';
import { GoalSchema } from '@/types';

export const goalDetailSchema = GoalSchema.pick({
  title: true,
  background: true,
  success_criteria: true,
  status: true,
  cost: true,
  ddl: true,
  notes: true,
}).extend({
  title: z.string().min(1, '标题不能为空'),
  background: z.string().min(1, '背景问题不能为空'),
  cost: z.number().int().min(1).max(10),
});

export type GoalDetailFormValues = z.infer<typeof goalDetailSchema>;

export const attemptSchema = z.object({
  hypothesis: z.string().min(1, '假设不能为空'),
  action: z.string().min(1, '行动不能为空'),
  result: z.string().min(1, '结果不能为空'),
  gradient: z.number().nullable(),
});

export type AttemptFormValues = z.infer<typeof attemptSchema>;
