import type { Goal } from '@/types';
import { loadGoals, attemptsForGoal } from './store';

const MAX_PATHS = 5;
const MAX_DEPTH = 6;

// 递归找所有从根到 goalId 的直接父节点路径（不含 goalId 自身）
// 返回值：每条路径是 [root, ..., direct_parent]
function findAncestorPaths(
  goalId: string,
  goals: Map<string, Goal>,
  visited = new Set<string>(),
): Goal[][] {
  if (visited.has(goalId)) return [[]]; // 防止环
  const goal = goals.get(goalId);
  if (!goal || goal.parent_ids.length === 0) return [[]]; // 根节点，无祖先

  const next = new Set(visited);
  next.add(goalId);

  const paths: Goal[][] = [];
  for (const parentId of goal.parent_ids) {
    const parent = goals.get(parentId);
    if (!parent) continue;
    const parentPaths = findAncestorPaths(parentId, goals, next);
    for (const p of parentPaths) {
      paths.push([...p, parent]);
    }
  }
  return paths.length > 0 ? paths : [[]];
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '…' : text;
}

function renderNode(g: Goal, compact = false): string[] {
  const lines: string[] = [`**${g.title}**`];
  if (g.background) lines.push(`- 背景：${compact ? truncate(g.background, 20) : g.background}`);
  if (g.success_criteria) lines.push(`- 成功标准：${compact ? truncate(g.success_criteria, 20) : g.success_criteria}`);
  if (g.ddl) lines.push(`- DDL：${g.ddl}`);
  return lines;
}

export function buildContextPack(goalId: string, opts: { compact?: boolean } = {}): string | null {
  const compact = opts.compact ?? false;
  const goals = loadGoals();
  const goal = goals.get(goalId);
  if (!goal) return null;

  const attempts = attemptsForGoal(goalId);

  const lines: string[] = [];

  // 上层目标
  const allPaths = findAncestorPaths(goalId, goals);
  const hasAncestors = allPaths.some((p) => p.length > 0);
  if (hasAncestors) {
    const capped = allPaths.slice(0, MAX_PATHS);
    const multi = capped.length > 1;
    const overflowed = allPaths.length > MAX_PATHS;
    lines.push(`## 上层目标${multi ? `（${allPaths.length} 条分支${overflowed ? `，展示前 ${MAX_PATHS} 条` : ''}）` : ''}`, '');
    for (let i = 0; i < capped.length; i++) {
      const path = capped[i].slice(-MAX_DEPTH);
      const truncated = capped[i].length > MAX_DEPTH;
      if (multi) {
        const branchTitle = path.map((g) => g.title).join(' → ');
        lines.push(`### 分支 ${i + 1}：${truncated ? '… → ' : ''}${branchTitle}`, '');
      }
      for (const ancestor of path) {
        lines.push(...renderNode(ancestor, compact), '');
      }
    }
  }

  // 当前目标
  lines.push('## 当前目标', '');
  lines.push(...renderNode(goal, compact), '');

  // 依赖项
  lines.push('## 依赖项');
  if (goal.dependencies.length > 0) {
    for (const depId of goal.dependencies) {
      const dep = goals.get(depId);
      lines.push(dep ? `- ${dep.title}` : `- *(未知)*`);
    }
  } else { lines.push('_无。_'); }
  lines.push('');

  // 近期尝试
  lines.push('## 近期尝试');
  if (attempts.length > 0) {
    if (compact) {
      lines.push(`_共 ${attempts.length} 个历史 attempt。_`);
    } else {
      for (const a of attempts) {
        lines.push(`### 尝试${a.gradient != null ? `（梯度: ${a.gradient}）` : ''}`);
        lines.push(`- **假设:** ${a.hypothesis}`, `- **行动:** ${a.action}`, `- **结果:** ${a.result}`);
      }
      lines.push('', '_新 Attempt 请勿重复以上路径。_');
    }
  } else { lines.push('_暂无尝试记录。_'); }
  lines.push('');

  return lines.join('\n');
}
