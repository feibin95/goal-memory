#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');
const PROJECT_ROOT = path.resolve(PLUGIN_ROOT, '..');
const TSX = path.join(PROJECT_ROOT, 'node_modules/.bin/tsx');
const CLI = path.join(PROJECT_ROOT, 'scripts/cli.ts');

function cli(args) {
  return execSync(`"${TSX}" "${CLI}" ${args}`, { cwd: PROJECT_ROOT }).toString().trim();
}

function getSessionKey(transcriptPath) {
  return path.basename(transcriptPath, '.jsonl');
}

// list 输出格式: ID(10) STATUS(12) DDL(11) TITLE
function parseListOutput(listOutput) {
  const goals = [];
  let inData = false;
  for (const line of listOutput.split('\n')) {
    if (line.startsWith('-'.repeat(10))) { inData = true; continue; }
    if (!inData || !line.trim()) continue;
    const id = line.slice(0, 10).trim();
    const title = line.slice(35).trim();
    if (id) goals.push({ id, title });
  }
  return goals;
}

let data = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { data += chunk; });
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(data || '{}');
    const transcriptPath = input.transcript_path;

    let userCount = 0;
    if (transcriptPath && fs.existsSync(transcriptPath)) {
      const lines = fs.readFileSync(transcriptPath, 'utf-8').split('\n').filter(Boolean);
      userCount = lines.filter(l => {
        try { return JSON.parse(l).type === 'user'; } catch (_) { return false; }
      }).length;
    }

    const sessionKey = transcriptPath ? getSessionKey(transcriptPath) : null;
    const boundGoalId = sessionKey ? cli(`session get ${sessionKey}`) : '';

    // 未绑定 且 前3条消息：每条都注入提醒，让 AI 继续追问
    if (sessionKey && !boundGoalId && userCount <= 3) {
      let listOutput;
      try { listOutput = cli('list'); } catch (_) { process.exit(0); }
      const goals = parseListOutput(listOutput);
      if (goals.length === 0) { process.exit(0); }

      const numberedList = goals.map((g, i) =>
        `${i + 1}. ${g.title}（ID: ${g.id}）`
      ).join('\n');

      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'UserPromptSubmit',
          additionalContext: [
            '[GoalMem 提醒] 会话尚未绑定目标，请先引导用户完成目标选择。',
            '',
            '目标列表：',
            numberedList,
            '',
            `- 用户报序号/关键词 → 调用 bind_session(sessionKey="${sessionKey}", goalId="对应ID")`,
            `- 用户跳过         → 调用 bind_session(sessionKey="${sessionKey}", goalId="NONE")`,
          ].join('\n'),
        },
      }));
      return;
    }

    // 常规注入阶段：每 20 条注入一次，或刚完成绑定时（userCount ≤ 3）立即注入一次
    const justBound = boundGoalId && boundGoalId !== 'NONE' && userCount <= 3;
    if (!justBound && userCount % 20 !== 1) process.exit(0);

    let context;
    if (boundGoalId && boundGoalId !== 'NONE') {
      // 已绑定真实目标：注入目标详情
      try {
        const contextOutput = cli(`context ${boundGoalId}`);
        context = '[GoalMem] 当前会话目标详情\n\n' + contextOutput;
      } catch (_) { process.exit(0); }
    } else {
      // 临时会话（NONE 或超时未绑定）：注入全局目标列表
      const list = cli('list');
      context = [
        '[GoalMem] 当前目标概览',
        list,
        '可用工具: get_next_goal / list_goals / get_goal_context / start_goal / complete_goal',
      ].join('\n');
    }

    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: context,
      },
    }));
  } catch (_) {
    process.exit(0);
  }
});
