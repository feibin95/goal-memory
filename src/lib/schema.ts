import { z } from 'zod';

// 表单校验 schema：字段与 GoalSchema 对应，但不带默认值（react-hook-form 要求 input/output 类型一致）
export const goalDetailSchema = z.object({
  title:            z.string().min(1, '标题不能为空'),
  background:       z.string().min(1, '背景问题不能为空'),
  success_criteria: z.string(),
  status:           z.enum(['ready', 'in_progress', 'done']),
  cost:             z.number().int().min(1).max(10),
  ddl:              z.string().nullable(),
  notes:            z.array(z.string()),
});

export type GoalDetailFormValues = z.infer<typeof goalDetailSchema>;

export const attemptSchema = z.object({
  hypothesis: z.string().min(1, '假设不能为空'),
  action: z.string().min(1, '行动不能为空'),
  result: z.string().min(1, '结果不能为空'),
  gradient: z.number().nullable(),
});

export type AttemptFormValues = z.infer<typeof attemptSchema>;
