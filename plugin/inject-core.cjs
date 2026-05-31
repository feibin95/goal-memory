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
  if (count === 1) {
    // 首次调用（session 刚开始）始终注入
    fs.writeFileSync(counterFile, String(count));
    return true;
  }
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
 * @param {number} interval - throttle interval for UserPromptSubmit (PostToolUse now uses lockfile)
 */
function shouldInjectThrottled(toolName, hookEventName, sessionKey, counterPrefix, interval) {
  if (hookEventName === 'UserPromptSubmit') {
    return throttleByCounter(path.join(os.tmpdir(), `${counterPrefix}prompt-${sessionKey}`), 5);
  }

  if (hookEventName !== 'PostToolUse') return true;
  // 注意：injectIfNeeded 已不再调用此函数处理 PostToolUse 路径（由 lockfile 逻辑接管）
  // 以下逻辑保留仅供外部直接调用兼容
  if (STATE_CHANGING_TOOLS.has(toolName)) return true;
  return throttleByCounter(path.join(os.tmpdir(), `${counterPrefix}${sessionKey}`), interval);
}

/**
 * PostToolUse 专用：用 exclusive lockfile + 冷却窗口替代计数器节流。
 *
 * 解决两类问题：
 *   1. 毫秒级竞态：多个并行工具同时完成时，所有 PostToolUse 进程并发运行，
 *      计数器的"读-判断-写"非原子，导致多个进程都通过检查并重复注入。
 *      openSync('wx') 是 POSIX 原子操作，同一时刻只有一个进程能成功创建文件。
 *   2. 秒级连续注入（如同一 turn 内 bind_session→create_attempt 先后完成）：
 *      锁文件在冷却期内不删除，后续进程检查 mtime < COOLDOWN_MS 即跳过。
 *
 * trade-off：冷却期内的后续状态变化（如 create_attempt 的 State 3）被推迟到
 * 冷却窗口结束后的下一个注入触发点。模型可通过工具返回值感知状态，影响可接受。
 *
 * @param {string} lockFile - 锁文件路径（per session）
 * @param {Function} fn - 执行注入的回调，返回注入结果字符串
 * @returns {string} 'emitted' | 'no-context' | 'cooldown-skipped' | 'race-skipped'
 */
const INJECT_COOLDOWN_MS = 3000;

function withInjectLockAndCooldown(lockFile, fn) {
  let fd;
  try {
    fd = fs.openSync(lockFile, 'wx'); // POSIX 原子创建：成功=拿到锁，EEXIST=已有进程持有
  } catch (_) {
    // 文件已存在：检查是否仍在冷却窗口内
    try {
      const age = Date.now() - fs.statSync(lockFile).mtimeMs;
      if (age < INJECT_COOLDOWN_MS) return 'cooldown-skipped';
      // 冷却已过期：清理残留锁文件后重试
      fs.unlinkSync(lockFile);
      fd = fs.openSync(lockFile, 'wx'); // 仍可能与其他进程竞争，失败则跳过
    } catch (_) { return 'race-skipped'; }
  }
  try {
    return fn();
  } finally {
    fs.closeSync(fd);
    // 保留锁文件直到冷却期结束（不立即删除），防止冷却窗口内的后续进程重复注入
    // unref() 确保 setTimeout 不阻止进程正常退出
    setTimeout(() => { try { fs.unlinkSync(lockFile); } catch (_) {} }, INJECT_COOLDOWN_MS).unref();
  }
}

/**
 * 普通工具 PostToolUse 专用：次数 AND 时间双条件节流。
 *
 * 两个条件必须同时满足才注入：
 *   - count >= PERIODIC_MIN_CALLS：防止低频 session 里频繁刷新（anti-forgetfulness 周期）
 *   - time_since_last >= INJECT_COOLDOWN_MS：防止并发进程同时让 count 到达阈值时重复注入
 *
 * 用互斥锁（立即释放，无冷却期）保护 {count, lastTs} 的读-改-写是原子操作。
 * 拿不到锁的进程直接跳过（不等待），对计数有 ±1 的误差，节流场景下可接受。
 *
 * @param {string} counterFile - 存储 {count, lastTs} 的状态文件路径（per session）
 * @param {Function} fn - 执行注入的回调
 * @returns {string} 'emitted' | 'no-context' | 'throttled' | 'mutex-busy'
 */
const PERIODIC_MIN_CALLS = 20;

function withCountAndTimeLock(counterFile, fn) {
  const lockFile = counterFile + '.lock';
  let fd;
  try {
    fd = fs.openSync(lockFile, 'wx'); // 互斥：成功=拿到锁，EEXIST=其他进程持有，直接跳过
  } catch (_) {
    return 'mutex-busy';
  }
  try {
    let state = { count: 0, lastTs: 0 };
    try { state = JSON.parse(fs.readFileSync(counterFile, 'utf8')); } catch (_) {}

    state.count += 1;
    const timePassed = Date.now() - state.lastTs;

    if (state.count >= PERIODIC_MIN_CALLS && timePassed >= INJECT_COOLDOWN_MS) {
      state.count = 0;
      state.lastTs = Date.now();
      fs.writeFileSync(counterFile, JSON.stringify(state));
      return fn();
    }

    fs.writeFileSync(counterFile, JSON.stringify(state));
    return 'throttled';
  } finally {
    try { fs.closeSync(fd); fs.unlinkSync(lockFile); } catch (_) {} // 立即释放，无冷却期
  }
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
 * Core injection flow: throttle/lock check → compact decision → fetch context → emit.
 *
 * Compact logic:
 *   - PostToolUse state-change tool → full context（保留完整 guidance 文本）
 *   - UserPromptSubmit / PostToolUse 其他 → compact（不含 guidance 文本）
 *
 * 节流策略：
 *   - UserPromptSubmit：计数器节流（interval=5），单进程无竞态
 *   - PostToolUse：lockfile + 冷却窗口，解决并行工具竞态与连续状态变化重复注入
 */
function injectIfNeeded(sessionKey, eventName, payload, counterPrefix, interval, format = 'json') {
  const toolName = toolShortName(payload);
  const isStateChange = STATE_CHANGING_TOOLS.has(toolName) && eventName === 'PostToolUse';
  const compact = !isStateChange;

  function doEmit() {
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

  if (eventName === 'UserPromptSubmit') {
    // 单进程触发，无并发问题，保留计数器节流（每 5 次注入一次）
    if (!throttleByCounter(path.join(os.tmpdir(), `${counterPrefix}prompt-${sessionKey}`), 5)) {
      return 'throttled';
    }
    return doEmit();
  }

  if (eventName === 'PostToolUse') {
    if (STATE_CHANGING_TOOLS.has(toolName)) {
      // 状态变化工具：不受次数限制，只受 3s 冷却（防并行竞态 + 同 turn 内连续触发）
      const lockFile = path.join(os.tmpdir(), `${counterPrefix}lock-${sessionKey}`);
      const result = withInjectLockAndCooldown(lockFile, doEmit);
      if (result === 'emitted') {
        // 刚注入过完整上下文，重置周期计数，避免紧接着又触发普通工具的周期注入
        const counterFile = path.join(os.tmpdir(), `${counterPrefix}periodic-${sessionKey}`);
        try { fs.writeFileSync(counterFile, JSON.stringify({ count: 0, lastTs: Date.now() })); } catch (_) {}
      }
      return result;
    } else {
      // 普通工具：次数 >= 20 AND 距上次注入 >= 3s，两个条件同时满足才注入
      const counterFile = path.join(os.tmpdir(), `${counterPrefix}periodic-${sessionKey}`);
      return withCountAndTimeLock(counterFile, doEmit);
    }
  }

  // 其他事件（当前无配置，预留直接注入）
  return doEmit();
}

module.exports = { STATE_CHANGING_TOOLS, shouldInjectThrottled, throttleByCounter, withInjectLockAndCooldown, withCountAndTimeLock, readStdinJson, toolShortName, injectIfNeeded };
