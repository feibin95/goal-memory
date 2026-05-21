import type { Goal } from '@/types';
import { loadGoals, attemptsForGoal } from './store';
import { search } from './kb';

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

function renderNode(g: Goal): string[] {
  const lines: string[] = [`**[${g.id}]** ${g.title}`];
  if (g.background) lines.push(`- 背景：${g.background}`);
  if (g.success_criteria) lines.push(`- 成功标准：${g.success_criteria}`);
  if (g.ddl) lines.push(`- DDL：${g.ddl}`);
  return lines;
}

export function buildContextPack(goalId: string): string | null {
  const goals = loadGoals();
  const goal = goals.get(goalId);
  if (!goal) return null;

  const attempts = attemptsForGoal(goalId);

  const queryText = [goal.title, goal.background, goal.success_criteria].join(' ');
  const terms: string[] = [];
  for (const m of queryText.toLowerCase().matchAll(/[a-z0-9_-]+/g)) {
    if (m[0].length >= 4 && !terms.includes(m[0])) terms.push(m[0]);
  }
  const snippets: ReturnType<typeof search> = [];
  const seenKb = new Set<string>();
  for (const term of terms) {
    for (const entry of search(term)) {
      if (!seenKb.has(entry.id)) { snippets.push(entry); seenKb.add(entry.id); }
    }
    if (snippets.length >= 3) break;
  }

  const lines: string[] = ['# 上下文包', ''];

  // 祖先路径
  const allPaths = findAncestorPaths(goalId, goals);
  const hasAncestors = allPaths.some((p) => p.length > 0);
  if (hasAncestors) {
    const capped = allPaths.slice(0, MAX_PATHS);
    lines.push(`## 祖先路径（共 ${allPaths.length} 条${allPaths.length > MAX_PATHS ? `，展示前 ${MAX_PATHS} 条` : ''}）`, '');
    for (let i = 0; i < capped.length; i++) {
      const path = capped[i].slice(-MAX_DEPTH); // 超深时截取最近 N 层
      const truncated = capped[i].length > MAX_DEPTH;
      const pathTitle = path.map((g) => g.title).join(' → ');
      lines.push(`### 路径 ${i + 1}：${truncated ? '… → ' : ''}${pathTitle}`, '');
      for (const ancestor of path) {
        lines.push(...renderNode(ancestor), '');
      }
    }
  }

  // 当前目标
  lines.push('## 当前目标', '');
  lines.push(...renderNode(goal), '');

  // 依赖项
  lines.push('## 依赖项');
  if (goal.dependencies.length > 0) {
    for (const depId of goal.dependencies) {
      const dep = goals.get(depId);
      lines.push(dep ? `- [${dep.id}] ${dep.title}` : `- [${depId}] *(未知)*`);
    }
  } else { lines.push('_无。_'); }
  lines.push('');

  // 近期尝试
  lines.push('## 近期尝试');
  if (attempts.length > 0) {
    for (const a of attempts.slice(-5)) {
      lines.push(`### 尝试 ${a.id}${a.gradient != null ? `（梯度: ${a.gradient}）` : ''}`);
      lines.push(`- **假设:** ${a.hypothesis}`, `- **行动:** ${a.action}`, `- **结果:** ${a.result}`);
    }
  } else { lines.push('_暂无尝试记录。_'); }
  lines.push('');

  // 相关知识库片段
  lines.push('## 相关知识库片段');
  if (snippets.length > 0) {
    for (const s of snippets.slice(0, 3)) {
      lines.push(`### ${s.title}`, s.body.length > 300 ? s.body.slice(0, 300) + '...' : s.body);
      if (s.tags.length > 0) lines.push(`*标签: ${s.tags.join(', ')}*`);
    }
  } else { lines.push('_无匹配的知识库内容。_'); }
  lines.push('');
  return lines.join('\n');
}
