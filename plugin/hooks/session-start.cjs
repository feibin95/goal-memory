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


let data = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { data += chunk; });
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(data || '{}');
    const transcriptPath = input.transcript_path;
    if (!transcriptPath) process.exit(0);

    const sessionKey = getSessionKey(transcriptPath);
    const boundGoalId = cli(`session get ${sessionKey}`);

    if (boundGoalId) {
      // 已绑定目标，注入目标上下文
      if (boundGoalId === 'NONE') {
        // 用户明确跳过，静默
        process.exit(0);
      }
      let contextOutput;
      try { contextOutput = cli(`context ${boundGoalId}`); } catch (_) { process.exit(0); }
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: '[GoalMem] 续接会话，当前绑定目标：\n\n' + contextOutput,
        },
      }));
      return;
    }

    // 未绑定：获取目标列表
    let goals;
    try { goals = JSON.parse(cli('list --json')); } catch (_) { process.exit(0); }
    if (goals.length === 0) process.exit(0);

    const numberedList = goals.map((g, i) =>
      `${i + 1}. [${g.status}] ${g.title}（ID: ${g.id}）`
    ).join('\n');

    const context = [
      '[GoalMem 工作流指令 - 必须优先执行]',
      '此会话尚未绑定工作目标。请在本次回复的开头先向用户提问，不要先处理其他请求。',
      '',
      '目标列表：',
      numberedList,
      '',
      '操作说明（请按用户回答执行对应操作）：',
      `- 用户报序号或描述关键词 → 匹配对应目标，调用 bind_session(sessionKey="${sessionKey}", goalId="对应ID")`,
      `- 用户明确说不绑定/跳过  → 调用 bind_session(sessionKey="${sessionKey}", goalId="NONE")`,
      '- 绑定完成后再处理用户的实际请求，并在回复中附上目标上下文',
    ].join('\n');

    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: context,
      },
    }));
  } catch (_) {
    process.exit(0);
  }
});
