export type { GoalStatus, Goal, Attempt, KBEntry } from '@/types';
import type { Goal, Attempt, KBEntry } from '@/types';
import { GoalSchema, AttemptSchema, KBEntrySchema } from '../../types/index';

function now(): string {
  return new Date().toISOString();
}

function pad(n: number): string { return String(n).padStart(2, '0'); }

export function formatLocalTime(isoUtc: string): string {
  const d = new Date(isoUtc);
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function formatLocalDate(isoUtc: string): string {
  const d = new Date(isoUtc);
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

export const GoalUtils = {
  create(
    title: string,
    background: string,
    options?: {
      parentIds?: string[];
      dependencies?: string[];
      cost?: number;
      ddl?: string | null;
      successCriteria?: string;
    }
  ): Goal {
    const ts = now();
    return {
      id: '',  // assigned by SQLite AUTOINCREMENT in store.saveGoal
      title,
      background,
      parent_ids: options?.parentIds ?? [],
      dependencies: options?.dependencies ?? [],
      status: 'ready',
      cost: options?.cost ?? 3,
      ddl: options?.ddl ?? null,
      success_criteria: options?.successCriteria ?? '',
      notes: [],
      created_at: ts,
      updated_at: ts,
    };
  },
  toDict(g: Goal): Record<string, unknown> { return { ...g }; },
  fromDict(d: Record<string, unknown>): Goal {
    const raw: Record<string, unknown> = { ...d };
    // 迁移：parent_id(string|null) → parent_ids(array)
    if (!Array.isArray(raw['parent_ids'])) {
      raw['parent_ids'] = raw['parent_id'] ? [raw['parent_id']] : [];
    }
    delete raw['parent_id'];
    // 迁移：why → background
    if (!raw['background'] && raw['why']) raw['background'] = raw['why'];
    // 迁移：旧 status 值 → 新三态
    const statusMap: Record<string, string> = { proposed: 'ready', blocked: 'ready', review: 'in_progress', obsolete: 'done' };
    if (typeof raw['status'] === 'string' && statusMap[raw['status']]) raw['status'] = statusMap[raw['status']];
    return GoalSchema.parse(raw);
  },
};

export function validateDdl(goal: Goal, goals: Map<string, Goal>): string | null {
  if (goal.ddl) {
    // 子目标的 ddl 不能超过任何父节点的 ddl（取最严格约束）
    for (const parentId of goal.parent_ids) {
      const parent = goals.get(parentId);
      if (parent?.ddl && goal.ddl > parent.ddl)
        return `ddl ${goal.ddl} exceeds parent [${parentId}] ddl ${parent.ddl}`;
    }
    // 父目标的新 ddl 不能早于任何子节点的 ddl
    for (const g of goals.values()) {
      if (g.parent_ids.includes(goal.id) && g.ddl && g.ddl > goal.ddl)
        return `child goal [${g.id}] ddl ${g.ddl} would exceed new ddl ${goal.ddl}`;
    }
  }
  return null;
}

export const AttemptUtils = {
  create(
    goal_id: string, hypothesis: string, action: string, result: string,
    gradient?: number | null
  ): Attempt {
    return { id: '', goal_id, status: 'completed', files_dir: '', hypothesis, action, result, gradient: gradient ?? null, created_at: now() };
  },
  createActive(goal_id: string, files_dir: string, hypothesis?: string): Attempt {
    return { id: '', goal_id, status: 'active', files_dir, hypothesis: hypothesis ?? '', action: '', result: '', gradient: null, created_at: now() };
  },
  toDict(a: Attempt): Record<string, unknown> { return { ...a }; },
  fromDict(d: Record<string, unknown>): Attempt { return AttemptSchema.parse(d); },
};

export const KBEntryUtils = {
  create(title: string, body: string, tags?: string[]): KBEntry {
    return { id: '', title, body, tags: tags ?? [], created_at: now() };
  },
  toDict(e: KBEntry): Record<string, unknown> { return { ...e }; },
  fromDict(d: Record<string, unknown>): KBEntry { return KBEntrySchema.parse(d); },
};
