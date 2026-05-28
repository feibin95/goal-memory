#!/usr/bin/env tsx
/**
 * 一次性修复脚本：将 attempts.files_dir 中的旧项目路径替换为主目录路径
 *
 * 背景：从 goal-memory-demo/.goal-memory/ 迁移到 ~/.goal-memory/ 时，
 * 文件已移动但数据库里的 files_dir 字段路径前缀未更新。
 *
 * 用法：
 *   tsx scripts/migrate-fix-files-dir.ts [--dry-run]
 */

import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DRY_RUN = process.argv.includes('--dry-run');
const DB_PATH = path.join(os.homedir(), '.goal-memory', 'data.db');

const OLD_PREFIX = '/Users/chenfeibin/selfProjects/goal-memory-demo/.goal-memory/';
const NEW_PREFIX = path.join(os.homedir(), '.goal-memory') + '/';

interface AttemptRow {
  id: number;
  files_dir: string;
}

function backup() {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = DB_PATH + `.backup-${ts}`;
  fs.copyFileSync(DB_PATH, dest);
  console.log(`备份数据库 → ${dest}`);
}

const db = new Database(DB_PATH);
const affected = db.prepare<[], AttemptRow>(
  `SELECT id, files_dir FROM attempts WHERE files_dir LIKE ?`
).all(`${OLD_PREFIX}%`);

if (affected.length === 0) {
  console.log('没有需要修复的记录，退出。');
  process.exit(0);
}

console.log(`找到 ${affected.length} 条需要修复的记录：`);
for (const row of affected) {
  const newDir = row.files_dir.replace(OLD_PREFIX, NEW_PREFIX);
  console.log(`  [${row.id}] ${row.files_dir}\n       → ${newDir}`);
}

if (DRY_RUN) {
  console.log('\n--dry-run 模式，未修改数据库。去掉 --dry-run 参数后再次执行以应用修复。');
  process.exit(0);
}

backup();

const update = db.prepare(`UPDATE attempts SET files_dir = REPLACE(files_dir, ?, ?) WHERE id = ?`);
const run = db.transaction(() => {
  for (const row of affected) {
    update.run(OLD_PREFIX, NEW_PREFIX, row.id);
  }
});
run();

console.log(`\n修复完成，已更新 ${affected.length} 条记录。`);
