#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');
const { getSessionKey } = require('./build-state-context.cjs');
const { readStdinJson, injectIfNeeded } = require('./inject-core.cjs');

const eventName = process.argv[2] || 'UserPromptSubmit';
const format    = process.argv[3] || 'json';

function cleanSessionKey(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  return value.replace(/[^a-zA-Z0-9_.-]/g, '_');
}

function cwdSessionKey(payload) {
  const cwd = (typeof payload.cwd === 'string' && payload.cwd)
    || (typeof payload.workspace === 'string' && payload.workspace)
    || (typeof payload.workspace_root === 'string' && payload.workspace_root)
    || process.cwd();
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

function debugDump(payload, sessionKey, decision) {
  if (process.env.GOALMEM_HOOK_DEBUG !== '1') return;
  const env = {};
  for (const key of Object.keys(process.env).sort()) {
    if (/^(CODEX|PWD|HOME|USER|SHELL|CLAUDE|PWF|GOALMEM)/.test(key)) env[key] = process.env[key];
  }
  try {
    fs.appendFileSync(
      path.join(os.homedir(), '.codex', 'goalmem-hook-debug.jsonl'),
      JSON.stringify({
        ts: new Date().toISOString(), eventName, format,
        cwd: process.cwd(), payloadKeys: Object.keys(payload).sort(), payload, env, sessionKey, decision,
      }).slice(0, 20000) + '\n',
    );
  } catch (_) {}
}

readStdinJson(input => {
  const sessionKey = sessionKeyFromPayload(input);
  if (!sessionKey) { debugDump(input, null, 'skip:no-session-key'); return; }

  const result = injectIfNeeded(sessionKey, eventName, input, 'goalmem-codex-counter-', 20, format);
  debugDump(input, sessionKey, result === 'emitted' ? 'emit' : `skip:${result}`);
  if (result !== 'emitted') process.exit(0);
});
