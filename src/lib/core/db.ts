import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Bump this version whenever the schema changes.
// v0/v1 → v2: goals.id TEXT → INTEGER AUTOINCREMENT (full drop, re-migrate from JSONL)
// v2 → v3: attempts.id TEXT → INTEGER AUTOINCREMENT; sessions.attempt_id TEXT → INTEGER
const SCHEMA_VERSION = 3;

const ATTEMPTS_DDL = `
  CREATE TABLE IF NOT EXISTS attempts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    goal_id    INTEGER NOT NULL,
    status     TEXT NOT NULL DEFAULT 'active',
    files_dir  TEXT NOT NULL DEFAULT '',
    hypothesis TEXT NOT NULL DEFAULT '',
    action     TEXT NOT NULL DEFAULT '',
    result     TEXT NOT NULL DEFAULT '',
    gradient   REAL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (goal_id) REFERENCES goals(id)
  );
  CREATE INDEX IF NOT EXISTS idx_attempts_goal_id ON attempts(goal_id);
  CREATE INDEX IF NOT EXISTS idx_attempts_status  ON attempts(status);
`;

const SESSIONS_DDL = `
  CREATE TABLE IF NOT EXISTS sessions (
    session_key TEXT PRIMARY KEY,
    goal_id     INTEGER NOT NULL,
    attempt_id  INTEGER,
    created_at  TEXT NOT NULL
  );
`;

let db: Database.Database | null = null;
let currentBaseDir = path.join(os.homedir(), '.goal-memory');

export function setDbBaseDir(dir: string): void {
  if (db) { db.close(); db = null; }
  currentBaseDir = path.join(dir, '.goal-memory');
}

export function getDb(): Database.Database {
  const dbPath = path.join(currentBaseDir, 'data.db');
  if (!db || db.name !== dbPath) {
    if (db) { db.close(); db = null; }
    fs.mkdirSync(currentBaseDir, { recursive: true });
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema(db);
  }
  return db;
}

function initSchema(db: Database.Database): void {
  const version = db.pragma('user_version', { simple: true }) as number;

  if (version < 2) {
    // Full drop — re-run migrate-jsonl-to-sqlite.ts from JSONL backups.
    db.exec(`
      DROP TABLE IF EXISTS sessions;
      DROP TABLE IF EXISTS attempts;
      DROP TABLE IF EXISTS kb_entries;
      DROP TABLE IF EXISTS goals;
    `);
  } else if (version === 2) {
    // Surgical migration: only recreate attempts + sessions.
    // Goals and kb_entries are untouched.
    // NOTE: db.exec() cannot be called inside db.transaction() in better-sqlite3.
    //       Run DDL directly (SQLite treats DDL as auto-commit).
    const sessionRows = db.prepare('SELECT * FROM sessions').all() as Record<string, unknown>[];
    db.exec('DROP TABLE IF EXISTS sessions; DROP TABLE IF EXISTS attempts;');
    db.exec(ATTEMPTS_DDL + SESSIONS_DDL);
    const ins = db.prepare(
      'INSERT OR IGNORE INTO sessions (session_key, goal_id, attempt_id, created_at) VALUES (?, ?, ?, ?)'
    );
    for (const r of sessionRows) {
      ins.run(r['session_key'], Number(r['goal_id']), r['attempt_id'] ?? null, r['created_at']);
    }
    db.pragma(`user_version = ${SCHEMA_VERSION}`);
    return;
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS goals (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      title            TEXT NOT NULL,
      background       TEXT NOT NULL DEFAULT '',
      parent_ids       TEXT NOT NULL DEFAULT '[]',
      dependencies     TEXT NOT NULL DEFAULT '[]',
      status           TEXT NOT NULL DEFAULT 'ready',
      cost             INTEGER NOT NULL DEFAULT 3,
      ddl              TEXT,
      success_criteria TEXT NOT NULL DEFAULT '',
      notes            TEXT NOT NULL DEFAULT '[]',
      created_at       TEXT NOT NULL,
      updated_at       TEXT NOT NULL
    );
  ` + ATTEMPTS_DDL + `
    CREATE TABLE IF NOT EXISTS kb_entries (
      id         TEXT PRIMARY KEY,
      title      TEXT NOT NULL,
      body       TEXT NOT NULL,
      tags       TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );
  ` + SESSIONS_DDL);

  db.pragma(`user_version = ${SCHEMA_VERSION}`);
}
