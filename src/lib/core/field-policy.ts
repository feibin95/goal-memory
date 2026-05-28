export const GOAL_FIELD_LIMITS = {
  title: 6,
  background: 50,
  successCriteria: 80,
  note: 50,
} as const;

export const ATTEMPT_FIELD_LIMITS = {
  hypothesis: 40,
  action: 80,
  result: 80,
} as const;

export const GOAL_FIELD_GUIDANCE = {
  title: `目标标题不超过 ${GOAL_FIELD_LIMITS.title} 个字，越短越好。`,
  background: `写当前问题/缺口/风险，不写目标产物或行动清单，不超过 ${GOAL_FIELD_LIMITS.background} 个字。`,
  successCriteria: `写做到什么才算完成，不写背景原因，不超过 ${GOAL_FIELD_LIMITS.successCriteria} 个字。`,
  note: `只保留当前结论、canonical 产物或关键边界，不超过 ${GOAL_FIELD_LIMITS.note} 个字。`,
} as const;

export const ATTEMPT_FIELD_GUIDANCE = {
  hypothesis: `一句话写本次判断/假设，不写长计划，不超过 ${ATTEMPT_FIELD_LIMITS.hypothesis} 个字。`,
  action: `一句话写实际做了什么，不写过程流水账，不超过 ${ATTEMPT_FIELD_LIMITS.action} 个字。`,
  result: `一句话写结果、产物或结论，不写完整报告，不超过 ${ATTEMPT_FIELD_LIMITS.result} 个字。`,
} as const;

export function maxLengthMessage(label: string, max: number): string {
  return `${label}不能超过 ${max} 个字`;
}

export function validateMaxLengths(
  fields: Array<{ label: string; value: string | undefined | null; max: number }>
): string[] {
  return fields
    .filter(({ value, max }) => value !== undefined && value !== null && value.length > max)
    .map(({ label, max }) => maxLengthMessage(label, max));
}
