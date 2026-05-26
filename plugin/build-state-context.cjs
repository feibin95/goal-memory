#!/usr/bin/env node
'use strict';

const path = require('path');
const { execFileSync } = require('child_process');

// ─── CLI 工具 ──────────────────────────────────────────────────────────────────

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT;
const PROJECT_ROOT = PLUGIN_ROOT
  ? path.resolve(PLUGIN_ROOT, '..')   // CC：.claudecode/../ = 项目根
  : path.resolve(__dirname, '..');    // Codex：plugin/../ = 项目根
const TSX = path.join(PROJECT_ROOT, 'node_modules/.bin/tsx');
const CLI = path.join(PROJECT_ROOT, 'scripts/cli.ts');

function cli(args) {
  return execFileSync(TSX, [CLI, ...args], { cwd: PROJECT_ROOT }).toString().trim();
}

function cliJson(args, fallback) {
  try { return JSON.parse(cli(args)); } catch (_) { return fallback; }
}

function cliText(args) {
  try { return cli(args); } catch (_) { return null; }
}

// ─── 数据获取 ──────────────────────────────────────────────────────────────────

function fetchSession(sessionKey) {
  return cliJson(['session', 'get-full', sessionKey], {});
}

function fetchGoals() {
  return cliJson(['list', '--json'], null);
}

function fetchContext(goalId) {
  return cliText(['context', goalId]);
}

function fetchAvailableAttempts(goalId) {
  return cliJson(['attempt', 'available', goalId], []);
}

function fetchAttemptFiles(attemptId) {
  return cliText(['attempt', 'files', attemptId]) || '';
}

// ─── 阶段渲染 ──────────────────────────────────────────────────────────────────

function renderState1(sessionKey) {
  return [
    '[GoalMem] 当前会话尚未绑定目标，请告知要执行的目标名称。',
    `如需临时会话：bind_session(sessionKey="${sessionKey}", goalId="NONE")`,
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

function detectAttemptPhase(files) {
  if (!files) return 'research';

  const hasCheckboxes = /- \[[x ]\]/i.test(files);
  if (!hasCheckboxes) return 'research';

  const m = files.match(/## Current Phase\s*\n([^\n]+)/);
  if (m) {
    const n = parseInt((m[1].match(/Phase\s*(\d+)/i) || [])[1] || '1', 10);
    if (n <= 1) return 'planning';
  }
  return 'execution';
}

function renderState3(sessionKey, goalId, attemptId, context, files) {
  const phase = detectAttemptPhase(files);

  const header = [
    '[GoalMem] 执行中',
    '',
    context,
    files ? '\n' + files : '',
    '',
    '---',
  ];

  let guidance;
  if (phase === 'research') {
    guidance = [
      '## 执行阶段：调研 & 计划（当前）',
      '',
      '**[1] 广泛调研**',
      '  用可用工具（agent-reach 搜索、codex:rescue、find-skills、本地 kb 知识库等）搜集最佳实践和关键信息。',
      '  每完成 2 个查询，将结论汇总到 findings.md（Research Findings / Technical Decisions / Issues / Resources）。',
      '  **注意：调研只基于当前目标上下文。如有必要可查看子目标或兄弟目标，但其他无关目标不应影响调研。**',
      '',
      '**调研完成后判断：能否给出下一步具体动作？**',
      `  → 不能（目标仍太模糊/太大）→ 用 create_goal 逐一建子目标（title ≤6字，越简洁越好），bind_session 切换到优先级最高的子目标，回到 State 2 重新创建 Attempt（需人工 review 后继续）`,
      '  → 能 → 继续 [2]',
      '',
      '**[2] 写计划**',
      '  填写 task_plan.md：Key Questions / Decisions Made / Phases（每阶段可完成、可验证）/ Current Phase',
    ];
  } else if (phase === 'planning') {
    guidance = [
      '## 执行阶段：写计划（当前）',
      '',
      '**[2] 写计划**（调研已完成）',
      '  完善 task_plan.md：',
      '  - Key Questions：待回答的关键问题',
      '  - Decisions Made：决策 — 理由',
      '  - Phases：阶段划分（每阶段必须可完成、可验证）',
      '  - Current Phase：设置为 Phase 2（标志进入执行）',
      '',
      '  计划完成后需人工 review，确认后再进入执行。',
    ];
  } else {
    guidance = [
      '## 执行阶段：执行中（当前）',
      '',
      '**[3] 执行**',
      '  按 task_plan.md 推进，每个阶段完成后更新 progress.md（Session Log / Test Results / Error Log）。',
      '  遇到新情况随时修订 task_plan.md；同一错误绝不重复，每次必须变换方案。',
      '  期间产出的任何结论文件（分析报告、设计文档、调研结论等）都必须写入当前 attempt 目录。',
      '',
      '## Attempt 完成后',
      `  complete_attempt(attemptId="${attemptId}")`,
    ];
  }

  return [...header, ...guidance].filter(s => s !== null).join('\n');
}

// ─── 主调度器 ──────────────────────────────────────────────────────────────────

function buildStateContext(sessionKey) {
  const { goal_id: goalId, attempt_id: attemptId } = fetchSession(sessionKey);

  if (!goalId) {
    return renderState1(sessionKey);
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
