#!/usr/bin/env node
'use strict';

const path = require('path');
const { execSync } = require('child_process');

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');
const PROJECT_ROOT = path.resolve(PLUGIN_ROOT, '..');
const TSX = path.join(PROJECT_ROOT, 'node_modules/.bin/tsx');
const CLI = path.join(PROJECT_ROOT, 'scripts/cli.ts');

function cli(args) {
  return execSync(`"${TSX}" "${CLI}" ${args}`, { cwd: PROJECT_ROOT }).toString().trim();
}

let data = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { data += chunk; });
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(data || '{}');

    // 只处理 bind_session 工具调用
    if (!String(input.tool_name || '').includes('bind_session')) process.exit(0);

    // 解析 tool_input（可能是对象或 JSON 字符串）
    let toolInput = input.tool_input || {};
    if (typeof toolInput === 'string') {
      try { toolInput = JSON.parse(toolInput); } catch (_) { process.exit(0); }
    }

    const goalId = toolInput.goalId || '';
    if (!goalId || goalId === 'NONE') process.exit(0);

    // 获取目标详情并注入
    let contextOutput;
    try { contextOutput = cli(`context ${goalId}`); } catch (_) { process.exit(0); }

    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: '[GoalMem] 目标绑定成功，以下是目标详情：\n\n' + contextOutput,
      },
    }));
  } catch (_) {
    process.exit(0);
  }
});
