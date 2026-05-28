'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const STATE_CHANGING_TOOLS = new Set([
  'bind_session',   // 改变绑定目标 → 立即更新
  'create_attempt', // 切换到执行态 → 立即更新
  'update_attempt', // 标记完成 → 立即更新
]);

function throttleByCounter(counterFile, interval) {
  let count = 0;
  try { count = parseInt(fs.readFileSync(counterFile, 'utf8'), 10) || 0; } catch (_) {}
  count += 1;
  if (count < interval) {
    fs.writeFileSync(counterFile, String(count));
    return false;
  }
  fs.writeFileSync(counterFile, '0');
  return true;
}

/**
 * Returns true if context should be injected this call.
 * @param {string} toolName - short tool name (no mcp__ prefix)
 * @param {string} hookEventName
 * @param {string} sessionKey
 * @param {string} counterPrefix
 * @param {number} interval - throttle interval for PostToolUse non-state-change events
 */
function shouldInjectThrottled(toolName, hookEventName, sessionKey, counterPrefix, interval) {
  if (hookEventName === 'UserPromptSubmit') {
    return throttleByCounter(path.join(os.tmpdir(), `${counterPrefix}prompt-${sessionKey}`), 5);
  }

  if (hookEventName !== 'PostToolUse') return true;
  if (STATE_CHANGING_TOOLS.has(toolName)) return true;
  return throttleByCounter(path.join(os.tmpdir(), `${counterPrefix}${sessionKey}`), interval);
}

/**
 * Reads stdin to completion, parses JSON, then calls fn(input).
 * Silently exits on any error.
 */
function readStdinJson(fn) {
  let data = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { data += chunk; });
  process.stdin.on('end', () => {
    try {
      fn(JSON.parse(data || '{}'));
    } catch (_) {
      process.exit(0);
    }
  });
}

/**
 * Extracts the short tool name from a payload, stripping mcp__ prefixes and
 * dot-namespaced segments (e.g. "mcp__plugin_foo__bar_tool" → "bar_tool",
 * "some.namespace.tool" → "tool").
 */
function toolShortName(payload) {
  const raw = String(payload.tool_name || payload.tool || payload.name || '');
  return raw.split('.').pop().split('__').pop();
}

/**
 * Core injection flow: throttle check → compact decision → fetch context → emit.
 *
 * Compact logic:
 *   - state-change tool → full, delete full-sent flag (next injection also full)
 *   - first injection in session (no flag) → full, write flag
 *   - otherwise → compact
 */
function injectIfNeeded(sessionKey, eventName, payload, counterPrefix, interval, format = 'json') {
  const toolName = toolShortName(payload);
  const isStateChange = STATE_CHANGING_TOOLS.has(toolName) && eventName === 'PostToolUse';

  if (!shouldInjectThrottled(toolName, eventName, sessionKey, counterPrefix, interval)) {
    return 'throttled';
  }

  const flagFile = path.join(os.tmpdir(), `goalmem-full-sent-${sessionKey}`);
  let compact;
  if (isStateChange) {
    compact = false;
    try { fs.unlinkSync(flagFile); } catch (_) {}
  } else if (!fs.existsSync(flagFile)) {
    compact = false;
    try { fs.writeFileSync(flagFile, '1'); } catch (_) {}
  } else {
    compact = true;
  }

  const { buildStateContext } = require('./build-state-context.cjs');
  const context = buildStateContext(sessionKey, compact);
  if (!context) return 'no-context';

  if (format === 'json') {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: eventName, additionalContext: context },
    }));
  } else {
    process.stdout.write(context);
  }
  return 'emitted';
}

module.exports = { STATE_CHANGING_TOOLS, shouldInjectThrottled, throttleByCounter, readStdinJson, toolShortName, injectIfNeeded };
