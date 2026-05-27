import { Goal, GoalUtils, Attempt, AttemptUtils, KBEntry, KBEntryUtils } from './models';
import { getDb, setDbBaseDir } from './db';
import { deleteSessionsByGoalId, getSessionByAttemptId } from './session-store';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

export function setBaseDir(dir: string): void { setDbBaseDir(dir); }
export function resetBaseDir(): void { setDbBaseDir(os.homedir()); }

// ── helpers ──────────────────────────────────────────────────────────────────

function rowToGoal(r: Record<string, unknown>): Goal {
  return GoalUtils.fromDict({
    ...r,
    id:           String(r['id']),
    parent_ids:   JSON.parse(r['parent_ids'] as string),
    dependencies: JSON.parse(r['dependencies'] as string),
    notes:        JSON.parse(r['notes'] as string),
  });
}

function rowToAttempt(r: Record<string, unknown>): Attempt {
  return AttemptUtils.fromDict({ ...r, id: String(r['id']), goal_id: String(r['goal_id']) });
}

function rowToKBEntry(r: Record<string, unknown>): KBEntry {
  return KBEntryUtils.fromDict({
    ...r,
    tags: JSON.parse(r['tags'] as string),
  });
}

// ── Goals ─────────────────────────────────────────────────────────────────────

// Returns the saved goal with id filled in (AUTOINCREMENT for new goals).
export function saveGoal(goal: Goal): Goal {
  const db = getDb();
  const params = {
    ...goal,
    parent_ids:   JSON.stringify(goal.parent_ids),
    dependencies: JSON.stringify(goal.dependencies),
    notes:        JSON.stringify(goal.notes),
  };

  if (!goal.id) {
    // New goal: let SQLite assign an AUTOINCREMENT id.
    const { id: _drop, ...rest } = params;
    void _drop;
    const info = db.prepare(`
      INSERT INTO goals
        (title, background, parent_ids, dependencies, status, cost, ddl,
         success_criteria, notes, created_at, updated_at)
      VALUES
        (@title, @background, @parent_ids, @dependencies, @status, @cost, @ddl,
         @success_criteria, @notes, @created_at, @updated_at)
    `).run(rest);
    return { ...goal, id: String(info.lastInsertRowid) };
  }

  // Existing goal: upsert by id.
  db.prepare(`
    INSERT INTO goals
      (id, title, background, parent_ids, dependencies, status, cost, ddl,
       success_criteria, notes, created_at, updated_at)
    VALUES
      (@id, @title, @background, @parent_ids, @dependencies, @status, @cost, @ddl,
       @success_criteria, @notes, @created_at, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      title            = excluded.title,
      background       = excluded.background,
      parent_ids       = excluded.parent_ids,
      dependencies     = excluded.dependencies,
      status           = excluded.status,
      cost             = excluded.cost,
      ddl              = excluded.ddl,
      success_criteria = excluded.success_criteria,
      notes            = excluded.notes,
      updated_at       = excluded.updated_at
  `).run(params);
  return goal;
}

export function loadGoals(): Map<string, Goal> {
  const map = new Map<string, Goal>();
  for (const r of getDb().prepare('SELECT * FROM goals').all() as Record<string, unknown>[]) {
    const g = rowToGoal(r);
    map.set(g.id, g);
  }
  return map;
}

export function getGoal(goalId: string): Goal | null {
  const r = getDb().prepare('SELECT * FROM goals WHERE id = ?').get(Number(goalId)) as Record<string, unknown> | undefined;
  return r ? rowToGoal(r) : null;
}

export function deleteGoal(goalId: string): boolean {
  const db = getDb();
  const exists = db.prepare('SELECT 1 FROM goals WHERE id = ?').get(Number(goalId));
  if (!exists) return false;

  // 级联收集孤立子节点
  // row.id is INTEGER from SQLite; stringify for consistent Set/array comparisons.
  const all = db.prepare('SELECT id, parent_ids FROM goals').all() as { id: number; parent_ids: string }[];
  const allStr = all.map((row) => ({ id: String(row.id), parent_ids: row.parent_ids }));
  const toDelete = new Set<string>([goalId]);

  const collect = (id: string) => {
    for (const row of allStr) {
      const parents: string[] = JSON.parse(row.parent_ids);
      if (!parents.includes(id)) continue;
      const remaining = parents.filter((p) => !toDelete.has(p));
      if (remaining.length === 0) {
        toDelete.add(row.id);
        collect(row.id);
      }
    }
  };
  collect(goalId);

  // 多父节点子目标：只解除关系，不删除
  const unlink = allStr.filter((row) => {
    if (toDelete.has(row.id)) return false;
    const parents: string[] = JSON.parse(row.parent_ids);
    return parents.some((p) => toDelete.has(p));
  });

  const attemptDirs: string[] = [];
  for (const id of toDelete) {
    const rows = db.prepare('SELECT files_dir FROM attempts WHERE goal_id = ?').all(Number(id)) as { files_dir: string }[];
    for (const r of rows) { if (r.files_dir) attemptDirs.push(r.files_dir); }
  }

  db.transaction(() => {
    for (const row of unlink) {
      const parents: string[] = JSON.parse(row.parent_ids);
      const filtered = parents.filter((p) => !toDelete.has(p));
      db.prepare('UPDATE goals SET parent_ids = ? WHERE id = ?').run(JSON.stringify(filtered), Number(row.id));
    }
    for (const id of toDelete) {
      db.prepare('DELETE FROM attempts WHERE goal_id = ?').run(Number(id));
      db.prepare('DELETE FROM goals WHERE id = ?').run(Number(id));
      deleteSessionsByGoalId(id);
    }
  })();

  for (const dir of attemptDirs) try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}

  return true;
}

// ── Attempts ──────────────────────────────────────────────────────────────────

// Returns the saved attempt with id filled in (AUTOINCREMENT).
export function saveAttempt(attempt: Attempt): Attempt {
  const { id: _drop, ...rest } = attempt;
  void _drop;
  const info = getDb().prepare(`
    INSERT INTO attempts (goal_id, status, files_dir, hypothesis, action, result, gradient, created_at)
    VALUES (@goal_id, @status, @files_dir, @hypothesis, @action, @result, @gradient, @created_at)
  `).run({ ...rest, goal_id: Number(attempt.goal_id) });
  return { ...attempt, id: String(info.lastInsertRowid) };
}

export function loadAttempts(): Attempt[] {
  return (getDb().prepare('SELECT * FROM attempts').all() as Record<string, unknown>[]).map(rowToAttempt);
}

export function attemptsForGoal(goalId: string): Attempt[] {
  return (getDb().prepare('SELECT * FROM attempts WHERE goal_id = ?').all(Number(goalId)) as Record<string, unknown>[]).map(rowToAttempt);
}

export function getAttemptById(id: string): Attempt | null {
  const r = getDb().prepare('SELECT * FROM attempts WHERE id = ?').get(Number(id)) as Record<string, unknown> | undefined;
  return r ? rowToAttempt(r) : null;
}

export function getActiveAttempt(goalId: string): Attempt | null {
  const r = getDb()
    .prepare("SELECT * FROM attempts WHERE goal_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1")
    .get(Number(goalId)) as Record<string, unknown> | undefined;
  return r ? rowToAttempt(r) : null;
}

export function getAvailableAttempts(goalId: string): Attempt[] {
  const rows = getDb()
    .prepare("SELECT * FROM attempts WHERE goal_id = ? AND status = 'active' ORDER BY created_at DESC")
    .all(Number(goalId)) as Record<string, unknown>[];
  return rows.map(rowToAttempt).filter((a) => !getSessionByAttemptId(a.id));
}

export function nextAttemptSeq(goalId: string): number {
  const row = getDb()
    .prepare('SELECT COUNT(*) as cnt FROM attempts WHERE goal_id = ?')
    .get(Number(goalId)) as { cnt: number };
  return row.cnt + 1;
}

export function updateAttempt(id: string, patch: Partial<Record<string, unknown>>): boolean {
  const db = getDb();
  const numId = Number(id);
  const exists = db.prepare('SELECT 1 FROM attempts WHERE id = ?').get(numId);
  if (!exists) return false;
  const allowed = ['status', 'files_dir', 'hypothesis', 'action', 'result', 'gradient'];
  const keys = Object.keys(patch).filter((k) => allowed.includes(k));
  if (keys.length === 0) return true;
  const sets = keys.map((k) => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE attempts SET ${sets} WHERE id = @id`).run({ ...patch, id: numId });
  return true;
}

export function deleteAttempt(id: string): boolean {
  const db = getDb();
  const numId = Number(id);
  const row = db.prepare('SELECT files_dir FROM attempts WHERE id = ?').get(numId) as { files_dir: string } | undefined;
  if (!row) return false;
  db.prepare('DELETE FROM attempts WHERE id = ?').run(numId);
  if (row.files_dir) try { fs.rmSync(row.files_dir, { recursive: true, force: true }); } catch (_) {}
  return true;
}

// ── KB ────────────────────────────────────────────────────────────────────────

export function saveKbEntry(entry: KBEntry): void {
  getDb().prepare(`
    INSERT INTO kb_entries (id, title, body, tags, created_at)
    VALUES (@id, @title, @body, @tags, @created_at)
  `).run({ ...entry, tags: JSON.stringify(entry.tags) });
}

export function loadKb(): KBEntry[] {
  return (getDb().prepare('SELECT * FROM kb_entries').all() as Record<string, unknown>[]).map(rowToKBEntry);
}
