#!/usr/bin/env tsx
/**
 * 一次性迁移脚本：将 .goal-memory/attempts/ 下的旧格式目录
 * 从 {safeTitle}-{YYMMDD}-{seq} 迁移到 YYYY/MM/DD/{safeTitle}-{seq}
 *
 * 用法：
 *   tsx scripts/migrate-attempts-dirs.ts [--dry-run]
 *
 * 安全保障：
 *   A. 迁移前备份整个 .goal-memory/ 到 .goal-memory-backup-{timestamp}/
 *   B. Copy-Verify-Delete：先复制、验证文件完整性，再更新 DB，最后才删除旧目录
 *   C. 每条记录独立 SQLite 事务，失败只回滚当条
 */

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const DRY_RUN = process.argv.includes('--dry-run');
const BASE_DIR = path.join(process.cwd(), '.goal-memory');
const DB_PATH = path.join(BASE_DIR, 'data.db');

// 旧格式：{safeTitle}-{YYMMDD}-{seq}
// YYMMDD 是恰好 6 位数字，seq 是末尾纯数字
const OLD_FORMAT_RE = /^(.+)-(\d{2})(\d{2})(\d{2})-(\d+)$/;

interface AttemptRow {
  id: number;
  files_dir: string;
}

function parseOldDirName(basename: string): { yyyy: string; mm: string; dd: string; safeTitle: string; seq: string } | null {
  const m = OLD_FORMAT_RE.exec(basename);
  if (!m) return null;
  const [, safeTitle, yy, mm, dd, seq] = m;
  return { yyyy: `20${yy}`, mm, dd, safeTitle, seq };
}

function collectFiles(dir: string): Map<string, number> {
  const result = new Map<string, number>();
  const walk = (d: string, prefix: string) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const rel = path.join(prefix, entry.name);
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        walk(full, rel);
      } else {
        result.set(rel, fs.statSync(full).size);
      }
    }
  };
  walk(dir, '');
  return result;
}

function verifyDirCopy(src: string, dst: string): boolean {
  const srcFiles = collectFiles(src);
  const dstFiles = collectFiles(dst);
  if (srcFiles.size !== dstFiles.size) return false;
  for (const [rel, size] of srcFiles) {
    if (dstFiles.get(rel) !== size) return false;
  }
  return true;
}

function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`DB not found: ${DB_PATH}`);
    process.exit(1);
  }

  // ── A: 备份 ────────────────────────────────────────────────────────────────
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupDir = path.join(process.cwd(), `.goal-memory-backup-${timestamp}`);
  if (DRY_RUN) {
    console.log(`[dry-run] 将备份 ${BASE_DIR} → ${backupDir}`);
  } else {
    console.log(`备份 ${BASE_DIR} → ${backupDir} ...`);
    fs.cpSync(BASE_DIR, backupDir, { recursive: true });
    console.log(`备份完成。如需回滚：cp -r ${backupDir} ${BASE_DIR}\n`);
  }

  // ── 读取所有 attempts ───────────────────────────────────────────────────────
  const db = new Database(DB_PATH);
  const rows = db.prepare('SELECT id, files_dir FROM attempts').all() as AttemptRow[];

  let succeeded = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const oldDir = row.files_dir;
    if (!oldDir) { skipped++; continue; }

    const basename = path.basename(oldDir);
    const parsed = parseOldDirName(basename);
    if (!parsed) {
      // 已是新格式或无法识别，跳过
      console.log(`  跳过 [id=${row.id}] ${basename}（不匹配旧格式）`);
      skipped++;
      continue;
    }

    const { yyyy, mm, dd, safeTitle, seq } = parsed;
    const newDirName = `${safeTitle}-${seq}`;
    const newDir = path.join(BASE_DIR, 'attempts', yyyy, mm, dd, newDirName);

    console.log(`  迁移 [id=${row.id}] ${basename}`);
    console.log(`         → attempts/${yyyy}/${mm}/${dd}/${newDirName}`);

    if (DRY_RUN) { succeeded++; continue; }

    // ── B: Copy-Verify-Delete ────────────────────────────────────────────────
    try {
      // 如果旧目录不存在（DB 记录了但文件已丢失），跳过文件操作，只更新 DB
      const oldExists = fs.existsSync(oldDir);

      if (oldExists) {
        // 1. 复制
        fs.mkdirSync(path.dirname(newDir), { recursive: true });
        if (fs.existsSync(newDir)) {
          console.error(`    ✗ 目标路径已存在，跳过：${newDir}`);
          failed++;
          continue;
        }
        fs.cpSync(oldDir, newDir, { recursive: true });

        // 2. 验证
        if (!verifyDirCopy(oldDir, newDir)) {
          // 验证失败：删除不完整的新目录，保留旧目录
          fs.rmSync(newDir, { recursive: true, force: true });
          console.error(`    ✗ 文件验证失败，已清理新目录，旧目录保留：${oldDir}`);
          failed++;
          continue;
        }
      }

      // 3. 更新 DB（独立事务）
      db.transaction(() => {
        db.prepare('UPDATE attempts SET files_dir = ? WHERE id = ?').run(newDir, row.id);
      })();

      // 4. DB 更新成功后才删除旧目录
      if (oldExists) {
        fs.rmSync(oldDir, { recursive: true, force: true });
      }

      console.log(`    ✓ 成功`);
      succeeded++;
    } catch (err) {
      console.error(`    ✗ 错误：${(err as Error).message}`);
      // 尝试清理可能的半完成新目录
      try { if (fs.existsSync(newDir)) fs.rmSync(newDir, { recursive: true, force: true }); } catch (_) {}
      failed++;
    }
  }

  db.close();

  console.log(`\n── 结果 ──────────────────────────────────────────────────`);
  console.log(`  成功: ${succeeded}  跳过: ${skipped}  失败: ${failed}`);
  if (!DRY_RUN && succeeded > 0) {
    console.log(`\n备份保留在: ${backupDir}`);
    console.log(`验证无误后可手动删除备份目录。`);
  }
  if (failed > 0) process.exit(1);
}

main();
