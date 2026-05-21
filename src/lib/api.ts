import type { AppState, Goal } from '@/types';
import type { GoalDetailFormValues, AttemptFormValues } from './schema';

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
    title: string; background: string; parentIds?: string[];
    dependencies?: string[]; cost?: number; successCriteria?: string; ddl?: string | null;
  }) => req<Goal>('/api/goals', { method: 'POST', body: JSON.stringify(data) }),

  updateGoal: (id: string, data: GoalDetailFormValues) =>
    req<Goal>(`/api/goals/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  startGoal: (id: string) =>
    req<Goal>(`/api/goals/${id}/start`, { method: 'POST', body: JSON.stringify({}) }),

  completeGoal: (id: string) =>
    req<Goal>(`/api/goals/${id}/complete`, { method: 'POST', body: JSON.stringify({}) }),

  deleteGoal: (id: string) =>
    req<{ deleted: string }>(`/api/goals/${id}`, { method: 'DELETE' }),

  createAttempt: (goalId: string, data: AttemptFormValues) =>
    req('/api/attempts', { method: 'POST', body: JSON.stringify({ ...data, goalId }) }),

  getContext: (goalId: string) =>
    req<{ markdown: string }>(`/api/context/${goalId}`),
};
