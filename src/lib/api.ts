import type { AppState, Goal, GoalDetail } from '@/types';
import type { GoalDetailFormValues, AttemptFormValues } from '@/types';

async function req<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers as Record<string, string> || {}) },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || res.statusText);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getState: () => req<AppState>('/api/state'),

  createGoal: (data: {
    title: string; background: string; parent_ids?: string[];
    dependencies?: string[]; cost?: number; success_criteria?: string; ddl?: string | null;
  }) => req<Goal>('/api/goals', { method: 'POST', body: JSON.stringify(data) }),

  getGoal: (id: string) =>
    req<GoalDetail>(`/api/goals/${id}`),

  updateGoal: (id: string, data: GoalDetailFormValues & { parent_ids?: string[] }) =>
    req<Goal>(`/api/goals/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  deleteGoal: (id: string) =>
    req<{ deleted: string }>(`/api/goals/${id}`, { method: 'DELETE' }),

  createAttempt: (goalId: string, data: AttemptFormValues) =>
    req('/api/attempts', { method: 'POST', body: JSON.stringify({ ...data, goalId }) }),

  getContext: (goalId: string) =>
    req<{ markdown: string }>(`/api/context/${goalId}`),
};
