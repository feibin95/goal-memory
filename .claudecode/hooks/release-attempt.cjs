#!/usr/bin/env node
'use strict';

const path = require('path');
const { execSync } = require('child_process');

const CLI = path.resolve(__dirname, '../../scripts/cli.ts');

let data = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { data += chunk; });
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(data || '{}');
    const transcriptPath = input.transcript_path;
    if (!transcriptPath) process.exit(0);

    const sessionKey = path.basename(transcriptPath, '.jsonl');
    execSync(`tsx "${CLI}" session release-attempt "${sessionKey}"`, { stdio: 'ignore' });
  } catch (_) {
    // 静默失败，不阻塞 session 关闭
  }
  process.exit(0);
});
