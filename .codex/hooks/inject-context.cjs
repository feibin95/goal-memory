#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { buildStateContext, getSessionKey } = require('../../plugin/build-state-context.cjs');

const STATE_CHANGING_TOOLS = new Set([
  'bind_session',
  'create_attempt',
  'update_attempt',
  'delete_attempt',
  'update_goal',
  'create_goal',
  'delete_goal',
]);

const PERIODIC_INTERVAL = 5;

function loadPayload() {
  const raw = fs.readFileSync(0, 'utf8').trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function cleanSessionKey(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  return value.replace(/[^a-zA-Z0-9_.-]/g, '_');
}

function cwdFromPayload(payload) {
  if (typeof payload.cwd === 'string' && payload.cwd) return payload.cwd;
  if (typeof payload.workspace === 'string' && payload.workspace) return payload.workspace;
  if (typeof payload.workspace_root === 'string' && payload.workspace_root) return payload.workspace_root;
  return process.cwd();
}

function cwdSessionKey(payload) {
  const cwd = cwdFromPayload(payload);
  if (!cwd) return null;
  const digest = crypto.createHash('sha1').update(cwd).digest('hex').slice(0, 12);
  return `cwd-${digest}`;
}

function sessionKeyFromPayload(payload) {
  return cleanSessionKey(payload.session_id)
    || cleanSessionKey(payload.thread_id)
    || cleanSessionKey(payload.conversation_id)
    || cleanSessionKey(process.env.CODEX_THREAD_ID)
    || cleanSessionKey(process.env.CODEX_SESSION_ID)
    || cleanSessionKey(process.env.PWF_SESSION_ID)
    || (typeof payload.transcript_path === 'string' ? cleanSessionKey(getSessionKey(payload.transcript_path)) : null)
    || cwdSessionKey(payload);
}

function toolShortName(payload) {
  const raw = String(payload.tool_name || payload.tool || payload.name || '');
  return raw.split('.').pop().split('__').pop();
}

function shouldInject(eventName, payload, sessionKey) {
  if (eventName !== 'PostToolUse') return true;

  const toolName = toolShortName(payload);
  if (STATE_CHANGING_TOOLS.has(toolName)) return true;

  const counterFile = path.join(os.tmpdir(), `goalmem-codex-counter-${sessionKey}`);
  let count = 0;
  try {
    count = parseInt(fs.readFileSync(counterFile, 'utf8'), 10) || 0;
  } catch (_) {}

  count += 1;
  if (count < PERIODIC_INTERVAL) {
    fs.writeFileSync(counterFile, String(count));
    return false;
  }

  fs.writeFileSync(counterFile, '0');
  return true;
}

function emit(message, format, eventName) {
  if (format === 'json') {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: eventName,
        additionalContext: message,
      },
    }));
    return;
  }
  process.stdout.write(message);
}

function debugDump(eventName, format, payload, sessionKey, decision) {
  if (process.env.GOALMEM_HOOK_DEBUG !== '1') return;

  const env = {};
  for (const key of Object.keys(process.env).sort()) {
    if (/^(CODEX|PWD|HOME|USER|SHELL|CLAUDE|PWF|GOALMEM)/.test(key)) env[key] = process.env[key];
  }

  const record = {
    ts: new Date().toISOString(),
    eventName,
    format,
    cwd: process.cwd(),
    payloadKeys: Object.keys(payload).sort(),
    payload,
    env,
    sessionKey,
    decision,
  };

  const file = path.join(os.homedir(), '.codex', 'goalmem-hook-debug.jsonl');
  try {
    fs.appendFileSync(file, JSON.stringify(record).slice(0, 20000) + '\n');
  } catch (_) {}
}

function main() {
  const eventName = process.argv[2] || 'UserPromptSubmit';
  const format = process.argv[3] || 'text';
  const payload = loadPayload();
  const sessionKey = sessionKeyFromPayload(payload);
  if (!sessionKey) {
    debugDump(eventName, format, payload, null, 'skip:no-session-key');
    return;
  }
  if (!shouldInject(eventName, payload, sessionKey)) {
    debugDump(eventName, format, payload, sessionKey, 'skip:throttled');
    return;
  }

  const context = buildStateContext(sessionKey);
  if (!context) {
    debugDump(eventName, format, payload, sessionKey, 'skip:no-context');
    return;
  }

  debugDump(eventName, format, payload, sessionKey, 'emit');
  emit(context, format, eventName);
}

try {
  main();
} catch (_) {
  process.exit(0);
}
