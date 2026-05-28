#!/usr/bin/env node
'use strict';

const path = require('path');
const { execSync } = require('child_process');
const { readStdinJson } = require('../plugin/inject-core.cjs');

const CLI = path.resolve(__dirname, '../scripts/cli.ts');

readStdinJson(input => {
  try {
    const transcriptPath = input.transcript_path;
    if (!transcriptPath) process.exit(0);

    const sessionKey = path.basename(transcriptPath, '.jsonl');
    execSync(`tsx "${CLI}" session release-attempt "${sessionKey}"`, { stdio: 'ignore' });
  } catch (_) {
    // 静默失败，不阻塞 session 关闭
  }
  process.exit(0);
});
