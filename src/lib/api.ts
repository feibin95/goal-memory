import type { AppState, Goal, GoalDetail, Attempt } from '@/types';
import type { GoalDetailFormValues, AttemptFormValues } from '@/types';

function formatApiError(body: unknown, fallback: string): string {
  const error = (body as { error?: unknown })?.error;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const fieldErrors = (error as { fieldErrors?: Record<string, string[]> }).fieldErrors;
    if (fieldErrors) {
      const messages = Object.entries(fieldErrors).flatMap(([field, values]) =>
        values.map((message) => `${field}: ${message}`)
      );
      if (messages.length) return messages.join('\n');
    }
    const formErrors = (error as { formErrors?: string[] }).formErrors;
    if (formErrors?.length) return formErrors.join('\n');
  }
  return fallback;
}

async function req<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers as Record<string, string> || {}) },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(formatApiError(body, res.statusText));
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

  updateGoal: (id: string, data: GoalDetailFormValues & { parent_ids?: string[]; dependencies?: string[] }) =>
    req<Goal>(`/api/goals/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  deleteGoal: (id: string) =>
    req<{ deleted: string }>(`/api/goals/${id}`, { method: 'DELETE' }),

  createAttempt: (goalId: string, data: AttemptFormValues) =>
    req('/api/attempts', { method: 'POST', body: JSON.stringify({ ...data, goalId }) }),

  updateAttempt: (id: string, data: Partial<AttemptFormValues>) =>
    req<Attempt>(`/api/attempts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  deleteAttempt: (id: string) =>
    req<{ deleted: string }>(`/api/attempts/${id}`, { method: 'DELETE' }),

  getContext: (goalId: string) =>
    req<{ markdown: string }>(`/api/context/${goalId}`),
};
