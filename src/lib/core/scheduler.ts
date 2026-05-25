import type { Goal, Attempt } from '@/types';
import { loadGoals, loadAttempts } from './store';

export interface GoalListOptions {
  parent_id?: string;
  actionable?: boolean;
}

export function isLeaf(goal: Goal, goals: Map<string, Goal>): boolean {
  for (const g of goals.values()) { if (g.parent_ids.includes(goal.id)) return false; }
  return true;
}

export function depsDone(goal: Goal, goals: Map<string, Goal>): boolean {
  for (const depId of goal.dependencies) {
    const dep = goals.get(depId);
    if (!dep || dep.status !== 'done') return false;
  }
  return true;
}

// 返回直接父节点列表（多父节点支持）
export function parentChain(goal: Goal, goals: Map<string, Goal>): Goal[] {
  return goal.parent_ids
    .map((id) => goals.get(id))
    .filter((g): g is Goal => g !== undefined);
}

// 返回所有祖先节点（BFS，不含自身）
export function allAncestors(goal: Goal, goals: Map<string, Goal>): Goal[] {
  const visited = new Set<string>([goal.id]);
  const result: Goal[] = [];
  const queue = parentChain(goal, goals);
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current.id)) continue;
    visited.add(current.id);
    result.push(current);
    queue.push(...parentChain(current, goals));
  }
  return result;
}

export function ddlUrgency(goal: Goal): number {
  if (!goal.ddl) return 0;
  const daysLeft = (new Date(goal.ddl).getTime() - Date.now()) / 86_400_000;
  if (daysLeft <= 0) return 10;
  if (daysLeft >= 30) return 0;
  return Math.round((1 - daysLeft / 30) * 10 * 100) / 100;
}

export function unblockValue(goal: Goal, goals: Map<string, Goal>): number {
  let count = 0;
  for (const g of goals.values()) {
    if (g.dependencies.includes(goal.id) && g.status !== 'done')
      count++;
  }
  return count;
}

export function gradientBoost(goal: Goal, attempts: Attempt[]): number {
  return attempts
    .filter((a) => a.goal_id === goal.id && a.gradient != null)
    .reduce((sum, a) => sum + a.gradient!, 0);
}

export interface ScoreExplanation {
  ddl_urgency: number;
  unblock_value: number;
  cost_penalty: number;
  gradient_boost: number;
  total: number;
}

export function scoreGoal(goal: Goal, goals: Map<string, Goal>, attempts: Attempt[]): [number, ScoreExplanation] {
  const urgency = ddlUrgency(goal);
  const unblock = unblockValue(goal, goals);
  const costPenalty = goal.cost;
  const gradBoost = gradientBoost(goal, attempts);
  const total = urgency + 2.0 * unblock - 0.5 * costPenalty + gradBoost;
  return [total, {
    ddl_urgency: urgency, unblock_value: unblock, cost_penalty: costPenalty,
    gradient_boost: Math.round(gradBoost * 100) / 100, total: Math.round(total * 100) / 100,
  }];
}

export function candidateGoals(goals: Map<string, Goal>): Goal[] {
  return [...goals.values()].filter((g) => g.status === 'ready' && isLeaf(g, goals) && depsDone(g, goals));
}

export interface PickNextResult { goal: Goal; explanation: ScoreExplanation; }

export function pickNext(): PickNextResult | null {
  const goals = loadGoals();
  const attempts = loadAttempts();
  const candidates = candidateGoals(goals);
  if (candidates.length === 0) return null;
  let best = candidates[0];
  let bestScore = -Infinity;
  let bestExplanation: ScoreExplanation = { ddl_urgency: 0, unblock_value: 0, cost_penalty: 0, gradient_boost: 0, total: 0 };
  for (const g of candidates) {
    const [score, explanation] = scoreGoal(g, goals, attempts);
    if (score > bestScore) { bestScore = score; best = g; bestExplanation = explanation; }
  }
  return { goal: best, explanation: bestExplanation };
}

export function filterGoals(options: GoalListOptions = {}): (Goal & { score?: number })[] {
  const goals = loadGoals();
  let result = [...goals.values()];
  if (options.parent_id) {
    result = result.filter(g => g.parent_ids.includes(options.parent_id!));
  }
  if (options.actionable) {
    result = result.filter(g => g.status === 'ready' && isLeaf(g, goals) && depsDone(g, goals));
    const attempts = loadAttempts();
    return result
      .map(g => { const [score] = scoreGoal(g, goals, attempts); return { ...g, score }; })
      .sort((a, b) => b.score! - a.score!);
  }
  return result;
}
