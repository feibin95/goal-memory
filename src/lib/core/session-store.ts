import { getDb, setDbBaseDir } from './db';

export function setSessionBaseDir(dir: string): void { setDbBaseDir(dir); }

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

interface SessionRecord {
  session_key: string;
  goal_id:     string;
  attempt_id?: string;
  created_at:  string;
}

function cutoffISO(): string {
  return new Date(Date.now() - SEVEN_DAYS_MS).toISOString();
}

function rowToSession(r: Record<string, unknown>): SessionRecord {
  return {
    session_key: r['session_key'] as string,
    goal_id:     String(r['goal_id']),
    attempt_id:  r['attempt_id'] != null ? String(r['attempt_id']) : undefined,
    created_at:  r['created_at'] as string,
  };
}

export function saveSession(sessionKey: string, goalId: string): void {
  const db = getDb();
  // 清理过期记录
  db.prepare('DELETE FROM sessions WHERE created_at < ?').run(cutoffISO());
  db.prepare(`
    INSERT INTO sessions (session_key, goal_id, created_at)
    VALUES (?, ?, ?)
    ON CONFLICT(session_key) DO UPDATE SET goal_id = excluded.goal_id, created_at = excluded.created_at
  `).run(sessionKey, Number(goalId), new Date().toISOString());
}

export function getSessionGoal(sessionKey: string): string | null {
  const r = getDb()
    .prepare('SELECT goal_id FROM sessions WHERE session_key = ? AND created_at >= ?')
    .get(sessionKey, cutoffISO()) as { goal_id: number } | undefined;
  return r != null ? String(r.goal_id) : null;
}

export function getSession(sessionKey: string): SessionRecord | null {
  const r = getDb()
    .prepare('SELECT * FROM sessions WHERE session_key = ? AND created_at >= ?')
    .get(sessionKey, cutoffISO()) as Record<string, unknown> | undefined;
  return r ? rowToSession(r) : null;
}

export function bindAttempt(sessionKey: string, attemptId: string): void {
  getDb()
    .prepare('UPDATE sessions SET attempt_id = ? WHERE session_key = ?')
    .run(Number(attemptId), sessionKey);
}

export function getSessionByAttemptId(attemptId: string): SessionRecord | null {
  const r = getDb()
    .prepare('SELECT * FROM sessions WHERE attempt_id = ? AND created_at >= ?')
    .get(Number(attemptId), cutoffISO()) as Record<string, unknown> | undefined;
  return r ? rowToSession(r) : null;
}

export function loadSessions(): SessionRecord[] {
  return (getDb()
    .prepare('SELECT * FROM sessions WHERE created_at >= ?')
    .all(cutoffISO()) as Record<string, unknown>[]).map(rowToSession);
}

export function deleteSessionsByGoalId(goalId: string): void {
  getDb().prepare('DELETE FROM sessions WHERE goal_id = ?').run(Number(goalId));
}
