#!/usr/bin/env node
'use strict';

const path = require('path');
const { execSync } = require('child_process');

// ─── 层 1：CLI 工具 ────────────────────────────────────────────────────────────

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');
const PROJECT_ROOT = path.resolve(PLUGIN_ROOT, '..');
const TSX = path.join(PROJECT_ROOT, 'node_modules/.bin/tsx');
const CLI = path.join(PROJECT_ROOT, 'scripts/cli.ts');

function cli(args) {
  return execSync(`"${TSX}" "${CLI}" ${args}`, { cwd: PROJECT_ROOT }).toString().trim();
}

function cliJson(args, fallback) {
  try { return JSON.parse(cli(args)); } catch (_) { return fallback; }
}

function cliText(args) {
  try { return cli(args); } catch (_) { return null; }
}

// ─── 层 2：数据获取 ────────────────────────────────────────────────────────────

function fetchSession(sessionKey) {
  return cliJson(`session get-full ${sessionKey}`, {});
}

function fetchGoals() {
  return cliJson('list --json', null);
}

function fetchContext(goalId) {
  return cliText(`context ${goalId}`);
}

function fetchAvailableAttempts(goalId) {
  return cliJson(`attempt available ${goalId}`, []);
}

function fetchAttemptFiles(attemptId) {
  return cliText(`attempt files ${attemptId}`) || '';
}

// ─── 层 3：阶段渲染 ────────────────────────────────────────────────────────────

const WORKFLOW = '工作流：[1] 选择目标 → [2] 评估决策 → [3] 执行 Attempt → [4] 完成记录';

function header(stage) {
  return `[GoalMem] ${WORKFLOW}\n当前阶段：${stage}`;
}

function renderStage1(sessionKey, goals) {
  const numbered = goals.map((g, i) =>
    `${i + 1}. [${g.status}] ${g.title}（ID: ${g.id}）`
  ).join('\n');

  return [
    header('[1] 选择目标'),
    '',
    numbered,
    '',
    `→ 调用 bind_session(sessionKey="${sessionKey}", goalId="对应ID") 绑定目标`,
    `→ 调用 bind_session(sessionKey="${sessionKey}", goalId="NONE") 跳过（临时会话）`,
  ].join('\n');
}

function renderStage2History(sessionKey, goalId, context, available) {
  return [
    header('[2] 评估决策'),
    '',
    context,
    '',
    '---',
    `## [2] 有 ${available.length} 个未完成的历史 Attempt，请先处理`,
    '',
    '**选择续接**：',
    ...available.map(a => `- [${a.id}]（创建于 ${a.created_at.slice(0, 10)}）`),
    `→ 续接某个：\`start_attempt(goalId="${goalId}", sessionKey="${sessionKey}", existingAttemptId="<选择的ID>")\``,
    '',
    '**不续接**：逐一调用 `complete_attempt(attemptId="<ID>")` 将其标为完成/放弃，处理完所有 Attempt 后重新进入，将进入评估决策流程',
  ].join('\n');
}

function renderExecutionPath(sessionKey, goalId) {
  return [
    `  • 总分 ≥ 5 → **执行路径**，按顺序执行：`,
    `    ① 查历史 Attempt（门控 + 参考）：`,
    `       门控：若已有 ≥3 次 Attempt 且其中一次满足成功标准 → \`update_goal(goalId="${goalId}", status="done")\` 标完成，按下方"找下一个目标"规则切换绑定，重新进入 [2] 评估；不再继续后续步骤`,
    `       参考：否则记录各次已试路线和结果，后续步骤中确保不重蹈覆辙`,
    `    ② 并行调研：同时启动 \`codex:rescue\`（联网搜索最佳实践）、\`agent-reach\`（扩展搜索）、\`find-skills\`（查可用技能），汇总结论`,
    `    ③ Codex review 执行方案：将调研结论和执行计划交给 \`codex:rescue\` review；若 review 结论与当前判断不一致，输出分歧并暂停，等人确认后再继续`,
    `    ④ 创建 Attempt：\`start_attempt(goalId="${goalId}", sessionKey="${sessionKey}")\`，拿到返回的 filesDir 路径`,
    `    ⑤ 写 findings.md：填 Research Findings（各工具调研结论）、Technical Decisions（决策 — 理由）、Issues（已知风险）、Resources（链接/路径）；每完成 2 个查询/浏览操作立即保存，防止多模态内容丢失`,
    `    ⑥ 写 task_plan.md：填 Key Questions（待回答的关键问题）、Decisions Made（决策 — 理由）；更新 Current Phase 并勾选已完成阶段；每个阶段必须可完成、可验证`,
    `    ⑦ 开始执行，持续更新 progress.md：Session Log 记 Status/Actions/Files Modified；Test Results 记测试表格；Error Log 记错误+尝试次数（同一错误绝不重复，每次必须变换方案）；断点续传前回答 Reboot Check 五问（在哪/去哪/目标/已学/已做）`,
  ].join('\n');
}

function renderSplitPath(sessionKey, goalId) {
  return [
    `  • 总分 < 5 → **拆分路径**，按顺序执行：`,
    `    ① 并行调研：同时启动 \`codex:rescue\`（联网搜索）与 \`agent-reach\` 找该目标的最佳拆分方式，交叉验证后确定子任务列表`,
    `    ② Codex review 拆分方案：将拟定的子任务列表交给 \`codex:rescue\` review；若 review 结论与当前判断不一致，输出分歧并暂停，等人确认后再继续`,
    `    ③ 建子目标：对每个子任务调用 \`create_goal(parent_ids=["${goalId}"], title=..., background=..., success_criteria=...)\`，返回值中直接含 goalId，逐一记录`,
    `    ④ 自判优先级：从 ③ 拿到的 goalId 列表中，综合 DDL 紧迫度、依赖关系（先做无依赖的）、完成后能解锁几个后续目标，选出最先要做的那个`,
    `    ⑤ 切换绑定：\`bind_session(goalId="<④选出的goalId>", sessionKey="${sessionKey}")\``,
    `    ⑥ 重新评估：回到 Step 1，对新绑定的子目标重新走 6 分法 → Codex review → 路径决策`,
  ].join('\n');
}

function renderNextGoalRules(sessionKey) {
  return [
    '## 找下一个目标规则（目标完成后使用）',
    `① 在同级目标（parent_ids 相同）中，按优先级（无依赖的优先、DDL 最近的优先、能解锁最多后续目标的优先）选出下一个 status=ready 的叶子目标`,
    `② 若同级全部 done → 判断父目标成功标准是否已满足，若是则 \`update_goal(goalId="<parentId>", status="done")\` 标完成，在父目标的同级里继续寻找`,
    `③ 循环 ①②，直到找到可执行目标 → \`bind_session(goalId="<找到的goalId>", sessionKey="${sessionKey}")\` 切换绑定，重新进入 [2] 评估`,
  ].join('\n');
}

function renderStage2Decision(sessionKey, goalId, context) {
  return [
    header('[2] 评估决策'),
    '',
    context,
    '',
    '---',
    '## [2] 执行流程（按顺序）',
    '**Step 1**：对当前目标完成 6 分法自评（每项 0-1 分），给出每项得分（含理由）和总分：',
    '  ① 5 分钟内能写出下一步具体动作？',
    '  ② 1-4 周内能看到明确结果？',
    '  ③ 能写出 2-5 个可量化 KR？',
    '  ④ 完成后父目标明显推进？',
    '  ⑤ 知道主要阻碍是什么？',
    '  ⑥ 执行主要由自己控制（不依赖外部不可控因素）？',
    '**Step 2**：将自评结果交给 `codex:rescue` review，让它判断打分是否合理、有无遗漏',
    '**Step 3**：对比 Step 1 自评与 Codex review 结论——若两者一致，继续 Step 4；若不一致（评分差异 > 1 分，或对执行/拆分路径判断相反），输出双方分歧并暂停，等人确认后再继续',
    '**Step 4**：按最终总分走路径决策：',
    renderExecutionPath(sessionKey, goalId),
    renderSplitPath(sessionKey, goalId),
    '',
    renderNextGoalRules(sessionKey),
    '',
  ].join('\n');
}

function renderStage3(sessionKey, goalId, attemptId, context, files) {
  return [
    header('[3] 执行 Attempt'),
    '',
    context,
    files ? '\n' + files : '',
    '',
    '---',
    '## 执行规范',
    '• findings.md：每完成 2 个查询/浏览操作立即保存（Research Findings / Technical Decisions / Issues / Resources）',
    '• task_plan.md：每完成一个阶段更新 Current Phase + 勾选 Phases；Key Questions 和 Decisions Made 随时补充；阶段必须可完成、可验证',
    `• progress.md：每阶段完成或出错时更新 Session Log（Status/Actions/Files Modified）、Test Results、Error Log（含尝试次数，同一错误绝不重复必须变换方案）；断点续传前回答 Reboot Check 五问`,
    '',
    '## Attempt 完成后',
    `① \`complete_attempt(attemptId="${attemptId}")\` 标记完成`,
    `② \`bind_session(goalId="${goalId}", sessionKey="${sessionKey}")\` 清除 attempt 绑定，回到 [2] 评估`,
    '③ 若目标成功标准已满足，在 [2] 评估时直接走"找下一个目标"规则切换到下一个目标',
  ].filter(Boolean).join('\n');
}

// ─── 主调度器 ──────────────────────────────────────────────────────────────────

function buildStateContext(sessionKey) {
  const { goal_id: goalId, attempt_id: attemptId } = fetchSession(sessionKey);

  if (!goalId) {
    const goals = fetchGoals();
    if (!goals?.length) return null;
    return renderStage1(sessionKey, goals);
  }

  if (goalId === 'NONE') return null;

  const context = fetchContext(goalId);
  if (!context) return null;

  if (!attemptId) {
    const available = fetchAvailableAttempts(goalId);
    return available.length
      ? renderStage2History(sessionKey, goalId, context, available)
      : renderStage2Decision(sessionKey, goalId, context);
  }

  const files = fetchAttemptFiles(attemptId);
  return renderStage3(sessionKey, goalId, attemptId, context, files);
}

function getSessionKey(transcriptPath) {
  return path.basename(transcriptPath, '.jsonl');
}

module.exports = { buildStateContext, getSessionKey };
