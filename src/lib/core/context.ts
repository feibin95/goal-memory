import { loadGoals, attemptsForGoal } from './store';
import { parentChain } from './scheduler';
import { search } from './kb';

export function buildContextPack(goalId: string): string | null {
  const goals = loadGoals();
  const goal = goals.get(goalId);
  if (!goal) return null;

  const chain = parentChain(goal, goals);
  const root = chain.length > 0 ? chain[chain.length - 1] : goal;
  const attempts = attemptsForGoal(goalId);

  const queryText = [goal.title, goal.background, goal.success_criteria].join(' ');
  const terms: string[] = [];
  for (const m of queryText.toLowerCase().matchAll(/[a-z0-9_-]+/g)) {
    if (m[0].length >= 4 && !terms.includes(m[0])) terms.push(m[0]);
  }
  const snippets: ReturnType<typeof search> = [];
  const seen = new Set<string>();
  for (const term of terms) {
    for (const entry of search(term)) {
      if (!seen.has(entry.id)) { snippets.push(entry); seen.add(entry.id); }
    }
    if (snippets.length >= 3) break;
  }

  const lines: string[] = ['# 上下文包', ''];
  lines.push('## 根目标', `**[${root.id}]** ${root.title}`, `> ${root.background}`, '');
  if (chain.length > 0) {
    lines.push('## 父链路');
    for (const p of [...chain].reverse()) lines.push(`- [${p.id}] ${p.title} *(状态: ${p.status})*`);
    lines.push('');
  }
  lines.push('## 当前目标', `**[${goal.id}]** ${goal.title}`,
    `- **状态:** ${goal.status}`, `- **成本:** ${goal.cost}`);
  if (goal.ddl) lines.push(`- **截止日期:** ${goal.ddl}`);
  lines.push('', '## 背景问题', goal.background, '');
  lines.push('## 成功标准', goal.success_criteria || '_未定义。_', '');
  lines.push('## 依赖项');
  if (goal.dependencies.length > 0) {
    for (const depId of goal.dependencies) {
      const dep = goals.get(depId);
      lines.push(dep ? `- [${dep.id}] ${dep.title} *(状态: ${dep.status})*` : `- [${depId}] *(未知)*`);
    }
  } else { lines.push('_无。_'); }
  lines.push('');
  lines.push('## 近期尝试');
  if (attempts.length > 0) {
    for (const a of attempts.slice(-5)) {
      lines.push(`### 尝试 ${a.id}${a.gradient != null ? `（梯度: ${a.gradient}）` : ''}`);
      lines.push(`- **假设:** ${a.hypothesis}`, `- **行动:** ${a.action}`, `- **结果:** ${a.result}`);
    }
  } else { lines.push('_暂无尝试记录。_'); }
  lines.push('');
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
