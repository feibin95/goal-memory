import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

let BASE_DIR = path.join(process.cwd(), '.goal-memory');

export function setSessionBaseDir(dir: string): void { BASE_DIR = path.join(dir, '.goal-memory'); }

function sessionsFile() { return path.join(BASE_DIR, 'sessions.jsonl'); }

function ensureDir() { fs.mkdirSync(BASE_DIR, { recursive: true }); }

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const SessionRecordSchema = z.object({
  session_key: z.string(),
  goal_id:     z.string(),
  created_at:  z.string(),
});
type SessionRecord = z.infer<typeof SessionRecordSchema>;

function readSessions(): SessionRecord[] {
  const file = sessionsFile();
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf-8')
    .split('\n').filter((l) => l.trim().length > 0)
    .map((l) => SessionRecordSchema.parse(JSON.parse(l)));
}

function writeSessions(records: SessionRecord[]): void {
  fs.writeFileSync(sessionsFile(), records.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf-8');
}

export function saveSession(sessionKey: string, goalId: string): void {
  ensureDir();
  const now = new Date();
  const cutoff = new Date(now.getTime() - SEVEN_DAYS_MS);
  const existing = readSessions()
    .filter((r) => new Date(r.created_at) > cutoff)
    .filter((r) => r.session_key !== sessionKey);
  existing.push({ session_key: sessionKey, goal_id: goalId, created_at: now.toISOString() });
  writeSessions(existing);
}

export function getSessionGoal(sessionKey: string): string | null {
  const cutoff = new Date(Date.now() - SEVEN_DAYS_MS);
  const record = readSessions()
    .filter((r) => new Date(r.created_at) > cutoff)
    .find((r) => r.session_key === sessionKey);
  return record?.goal_id ?? null;
}

export function loadSessions(): SessionRecord[] {
  const cutoff = new Date(Date.now() - SEVEN_DAYS_MS);
  return readSessions().filter((r) => new Date(r.created_at) > cutoff);
}
