#!/usr/bin/env node
'use strict';

const path = require('path');
const { execSync } = require('child_process');

// ─── CLI 工具 ──────────────────────────────────────────────────────────────────

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

// ─── 数据获取 ──────────────────────────────────────────────────────────────────

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

// ─── 阶段渲染 ──────────────────────────────────────────────────────────────────

function renderState1(sessionKey, goals) {
  const numbered = goals.map((g, i) =>
    `${i + 1}. [${g.status}] ${g.title}（ID: ${g.id}）`
  ).join('\n');

  return [
    '[GoalMem] 当前会话尚未绑定目标',
    '',
    '目标列表：',
    numbered,
    '',
    '请按顺序执行：',
    `1. bind_session(sessionKey="${sessionKey}", goalId="<选择的ID>") 绑定目标`,
    `2. create_attempt(goalId="<同上>", sessionKey="${sessionKey}") 创建 Attempt`,
    '两步完成后即进入执行阶段。',
    '',
    `如需临时会话（不绑定目标）：bind_session(sessionKey="${sessionKey}", goalId="NONE")`,
  ].join('\n');
}

function renderState2(sessionKey, goalId, context, available) {
  const lines = [
    '[GoalMem] 目标已绑定，尚未创建 Attempt',
    '',
    context,
    '',
    '---',
  ];

  if (available.length > 0) {
    lines.push(`## 有 ${available.length} 个可续接的 Attempt`);
    available.forEach(a => {
      lines.push(`- [${a.id}]（创建于 ${a.created_at.slice(0, 10)}）`);
    });
    lines.push('');
    lines.push('续接已有 Attempt：');
    lines.push(`  create_attempt(goalId="${goalId}", sessionKey="${sessionKey}", existingAttemptId="<选择的ID>")`);
    lines.push('');
    lines.push('新建 Attempt：');
  } else {
    lines.push('## 开始执行');
  }

  lines.push(`  create_attempt(goalId="${goalId}", sessionKey="${sessionKey}")`);

  return lines.join('\n');
}

function renderState3(sessionKey, goalId, attemptId, context, files) {
  return [
    '[GoalMem] 执行中',
    '',
    context,
    files ? '\n' + files : '',
    '',
    '---',
    '## 执行三阶段（按顺序推进）',
    '',
    '**[1] 广泛调研**',
    '  用可用工具（搜索、浏览、find-skills 等）搜集最佳实践和关键信息。',
    '  每完成 2 个查询操作，将结论汇总到 findings.md（Research Findings / Technical Decisions / Issues / Resources）。',
    '',
    '**[2] 写计划**',
    '  基于调研结论填写 task_plan.md：',
    '  - Key Questions：待回答的关键问题',
    '  - Decisions Made：决策 — 理由',
    '  - Phases：阶段划分（每个阶段必须可完成、可验证）',
    '  - Current Phase：当前所在阶段',
    '',
    '**[3] 执行**',
    '  按 task_plan.md 推进，每个阶段完成后更新 progress.md（Session Log / Test Results / Error Log）。',
    '  遇到新情况随时修订 task_plan.md；同一错误绝不重复，每次必须变换方案。',
    '',
    '## Attempt 完成后',
    `  complete_attempt(attemptId="${attemptId}")`,
  ].filter(s => s !== null).join('\n');
}

// ─── 主调度器 ──────────────────────────────────────────────────────────────────

function buildStateContext(sessionKey) {
  const { goal_id: goalId, attempt_id: attemptId } = fetchSession(sessionKey);

  if (!goalId) {
    const goals = fetchGoals();
    if (!goals?.length) return null;
    return renderState1(sessionKey, goals);
  }

  if (goalId === 'NONE') return null;

  const context = fetchContext(goalId);
  if (!context) return null;

  if (!attemptId) {
    const available = fetchAvailableAttempts(goalId);
    return renderState2(sessionKey, goalId, context, available);
  }

  const files = fetchAttemptFiles(attemptId);
  return renderState3(sessionKey, goalId, attemptId, context, files);
}

function getSessionKey(transcriptPath) {
  return path.basename(transcriptPath, '.jsonl');
}

module.exports = { buildStateContext, getSessionKey };
