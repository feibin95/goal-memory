export type { GoalStatus, Goal, Attempt, KBEntry } from '@/types';
import type { Goal, Attempt, KBEntry } from '@/types';

function newId(): string {
  return crypto.randomUUID().slice(0, 8);
}

function now(): string {
  return new Date().toISOString();
}

export const GoalUtils = {
  create(
    title: string,
    background: string,
    options?: {
      parentId?: string;
      dependencies?: string[];
      cost?: number;
      ddl?: string | null;
      successCriteria?: string;
    }
  ): Goal {
    const ts = now();
    return {
      id: newId(),
      title,
      background,
      parent_id: options?.parentId ?? null,
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
  fromDict(d: Record<string, unknown>): Goal { return { ddl: null, ...d } as unknown as Goal; },
};

export function validateDdl(goal: Goal, goals: Map<string, Goal>): string | null {
  if (goal.parent_id && goal.ddl) {
    const parent = goals.get(goal.parent_id);
    if (parent?.ddl && goal.ddl > parent.ddl)
      return `ddl ${goal.ddl} exceeds parent ddl ${parent.ddl}`;
  }
  if (goal.ddl) {
    for (const g of goals.values()) {
      if (g.parent_id === goal.id && g.ddl && g.ddl > goal.ddl)
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
    return { id: newId(), goal_id, hypothesis, action, result, gradient: gradient ?? null, created_at: now() };
  },
  toDict(a: Attempt): Record<string, unknown> { return { ...a }; },
  fromDict(d: Record<string, unknown>): Attempt { return { gradient: null, ...d } as unknown as Attempt; },
};

export const KBEntryUtils = {
  create(title: string, body: string, tags?: string[]): KBEntry {
    return { id: newId(), title, body, tags: tags ?? [], created_at: now() };
  },
  toDict(e: KBEntry): Record<string, unknown> { return { ...e }; },
  fromDict(d: Record<string, unknown>): KBEntry { return d as unknown as KBEntry; },
};
