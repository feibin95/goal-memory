#!/usr/bin/env tsx
/**
 * 一次性迁移脚本：将 .goal-memory/*.jsonl 数据导入 SQLite。
 * 原 JSONL 文件保留不动（作为备份）。
 *
 * 注意：goals.id 从旧的随机 TEXT（如 "a1b2c3d4"）映射为新的 INTEGER AUTOINCREMENT（1, 2, 3…）。
 * parent_ids / dependencies / attempt.goal_id / session.goal_id 均会同步更新。
 */

import fs from 'node:fs';
import path from 'node:path';
import { getDb } from '../src/lib/core/db';

const BASE_DIR = path.join(process.cwd(), '.goal-memory');

function readJsonl(filename: string): Record<string, unknown>[] {
  const file = path.join(BASE_DIR, filename);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf-8')
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

function main() {
  if (!fs.existsSync(BASE_DIR)) {
    console.log('No .goal-memory directory found, nothing to migrate.');
    return;
  }

  const db = getDb();

  // ── Goals ──────────────────────────────────────────────────────────────────
  const goalRows = readJsonl('goals.jsonl');

  // Map old TEXT id → new INTEGER id (stored as string "1", "2"…)
  const idMap = new Map<string, string>();

  const insertGoal = db.prepare(`
    INSERT INTO goals
      (title, background, parent_ids, dependencies, status, cost, ddl,
       success_criteria, notes, created_at, updated_at)
    VALUES
      (@title, @background, @parent_ids, @dependencies, @status, @cost, @ddl,
       @success_criteria, @notes, @created_at, @updated_at)
  `);

  let goalCount = 0;
  for (const row of goalRows) {
    const oldId = row['id'] as string;
    try {
      const info = insertGoal.run({
        title:            row['title'] ?? '',
        background:       row['background'] ?? row['why'] ?? '',
        parent_ids:       '[]',  // will be patched after mapping is built
        dependencies:     '[]',
        status:           row['status'] ?? 'ready',
        cost:             row['cost'] ?? 3,
        ddl:              row['ddl'] ?? null,
        success_criteria: row['success_criteria'] ?? '',
        notes:            JSON.stringify(
                            Array.isArray(row['notes']) ? row['notes'] : []
                          ),
        created_at:       row['created_at'] ?? new Date().toISOString(),
        updated_at:       row['updated_at'] ?? row['created_at'] ?? new Date().toISOString(),
      });
      const newId = String(info.lastInsertRowid);
      idMap.set(oldId, newId);
      goalCount++;
    } catch (e) {
      console.warn(`  [warn] goal ${oldId}: ${e}`);
    }
  }

  // Patch parent_ids / dependencies using id mapping
  const updateRefs = db.prepare(
    'UPDATE goals SET parent_ids = ?, dependencies = ? WHERE id = ?'
  );
  for (const row of goalRows) {
    const oldId = row['id'] as string;
    const newId = idMap.get(oldId);
    if (!newId) continue;

    const oldParents: string[] = Array.isArray(row['parent_ids'])
      ? row['parent_ids'] as string[]
      : (row['parent_id'] ? [row['parent_id'] as string] : []);
    const oldDeps: string[] = Array.isArray(row['dependencies'])
      ? row['dependencies'] as string[]
      : [];

    const newParents = oldParents.map((id) => idMap.get(id) ?? id);
    const newDeps    = oldDeps.map((id) => idMap.get(id) ?? id);
    updateRefs.run(JSON.stringify(newParents), JSON.stringify(newDeps), Number(newId));
  }

  // ── Attempts ───────────────────────────────────────────────────────────────
  const attemptRows = readJsonl('attempts.jsonl');
  // attempts.id is now INTEGER AUTOINCREMENT — do not pass the old TEXT id.
  const insertAttempt = db.prepare(`
    INSERT INTO attempts
      (goal_id, status, files_dir, hypothesis, action, result, gradient, created_at)
    VALUES
      (@goal_id, @status, @files_dir, @hypothesis, @action, @result, @gradient, @created_at)
  `);

  let attemptCount = 0;
  for (const row of attemptRows) {
    const oldGoalId = row['goal_id'] as string;
    const newGoalId = idMap.get(oldGoalId);
    if (!newGoalId) {
      console.warn(`  [warn] attempt ${row['id']}: goal ${oldGoalId} not in idMap, skipping`);
      continue;
    }
    try {
      insertAttempt.run({
        goal_id:    Number(newGoalId),
        status:     row['status'] ?? 'completed',
        files_dir:  row['files_dir'] ?? '',
        hypothesis: row['hypothesis'] ?? '',
        action:     row['action'] ?? '',
        result:     row['result'] ?? '',
        gradient:   row['gradient'] ?? null,
        created_at: row['created_at'] ?? new Date().toISOString(),
      });
      attemptCount++;
    } catch (e) {
      console.warn(`  [warn] attempt ${row['id']}: ${e}`);
    }
  }

  // ── KB ─────────────────────────────────────────────────────────────────────
  const kbRows = readJsonl('kb.jsonl');
  const insertKb = db.prepare(`
    INSERT OR IGNORE INTO kb_entries (id, title, body, tags, created_at)
    VALUES (@id, @title, @body, @tags, @created_at)
  `);

  let kbCount = 0;
  for (const row of kbRows) {
    try {
      insertKb.run({
        id:         row['id'],
        title:      row['title'] ?? '',
        body:       row['body'] ?? '',
        tags:       JSON.stringify(Array.isArray(row['tags']) ? row['tags'] : []),
        created_at: row['created_at'] ?? new Date().toISOString(),
      });
      kbCount++;
    } catch (e) {
      console.warn(`  [warn] kb ${row['id']}: ${e}`);
    }
  }

  // ── Sessions ───────────────────────────────────────────────────────────────
  const sessionRows = readJsonl('sessions.jsonl');
  const insertSession = db.prepare(`
    INSERT OR IGNORE INTO sessions (session_key, goal_id, attempt_id, created_at)
    VALUES (@session_key, @goal_id, @attempt_id, @created_at)
  `);

  let sessionCount = 0;
  for (const row of sessionRows) {
    const oldGoalId = row['goal_id'] as string;
    const newGoalId = idMap.get(oldGoalId);
    if (!newGoalId) {
      console.warn(`  [warn] session ${row['session_key']}: goal ${oldGoalId} not in idMap, skipping`);
      continue;
    }
    try {
      insertSession.run({
        session_key: row['session_key'],
        goal_id:     Number(newGoalId),
        attempt_id:  row['attempt_id'] ?? null,
        created_at:  row['created_at'] ?? new Date().toISOString(),
      });
      sessionCount++;
    } catch (e) {
      console.warn(`  [warn] session ${row['session_key']}: ${e}`);
    }
  }

  console.log('Migration complete:');
  console.log(`  goals:    ${goalCount}/${goalRows.length}`);
  console.log(`  attempts: ${attemptCount}/${attemptRows.length}`);
  console.log(`  kb:       ${kbCount}/${kbRows.length}`);
  console.log(`  sessions: ${sessionCount}/${sessionRows.length}`);
  console.log('');
  console.log('ID mapping (old → new):');
  for (const [oldId, newId] of idMap) {
    const row = goalRows.find((r) => r['id'] === oldId);
    const title = (row?.['title'] as string) ?? '?';
    console.log(`  ${oldId} → ${newId}  (${title})`);
  }
  console.log('');
  console.log(`Database: ${path.join(BASE_DIR, 'data.db')}`);
  console.log(`JSONL files kept as backup in ${BASE_DIR}`);
}

main();
