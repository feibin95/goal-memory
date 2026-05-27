#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { buildStateContext, getSessionKey } = require('../plugin/build-state-context.cjs');

const STATE_CHANGING_TOOLS = new Set([
  'bind_session', 'create_attempt', 'update_attempt', 'update_goal', 'create_goal',
]);
const PERIODIC_INTERVAL = 5;

function shouldInject(input, sessionKey) {
  if (input.hook_event_name !== 'PostToolUse') return true;

  // 提取工具短名（去掉 mcp__ 前缀）
  const toolName = (input.tool_name || '').split('__').pop();
  if (STATE_CHANGING_TOOLS.has(toolName)) return true;

  // 非状态变更工具：每 PERIODIC_INTERVAL 次注入一次
  const counterFile = `/tmp/goalmem-counter-${sessionKey}`;
  let count = 0;
  try { count = parseInt(fs.readFileSync(counterFile, 'utf8')) || 0; } catch (_) {}
  count += 1;
  if (count < PERIODIC_INTERVAL) {
    fs.writeFileSync(counterFile, String(count));
    return false;
  }
  fs.writeFileSync(counterFile, '0');
  return true;
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
    if (!shouldInject(input, sessionKey)) process.exit(0);

    const additionalContext = buildStateContext(sessionKey);
    if (!additionalContext) process.exit(0);

    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: input.hook_event_name, additionalContext },
    }));
  } catch (_) {
    process.exit(0);
  }
});
