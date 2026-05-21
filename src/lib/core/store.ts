import fs from 'node:fs';
import path from 'node:path';
import { Goal, GoalUtils, Attempt, AttemptUtils, KBEntry, KBEntryUtils } from './models';

let BASE_DIR = path.join(process.cwd(), '.goal-memory');

export function setBaseDir(dir: string): void { BASE_DIR = path.join(dir, '.goal-memory'); }
export function resetBaseDir(): void { BASE_DIR = path.join(process.cwd(), '.goal-memory'); }

function goalsFile() { return path.join(BASE_DIR, 'goals.jsonl'); }
function attemptsFile() { return path.join(BASE_DIR, 'attempts.jsonl'); }
function kbFile() { return path.join(BASE_DIR, 'kb.jsonl'); }

function ensureDir() { fs.mkdirSync(BASE_DIR, { recursive: true }); }

function appendLine(filePath: string, obj: Record<string, unknown>) {
  fs.appendFileSync(filePath, JSON.stringify(obj) + '\n', 'utf-8');
}

function readAll(filePath: string): Record<string, unknown>[] {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf-8')
    .split('\n').filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

function rewrite(filePath: string, records: Record<string, unknown>[]) {
  fs.writeFileSync(filePath, records.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf-8');
}

export function saveGoal(goal: Goal): void {
  ensureDir();
  const records = readAll(goalsFile());
  rewrite(goalsFile(), [...records.filter((r) => r['id'] !== goal.id), GoalUtils.toDict(goal)]);
}

export function loadGoals(): Map<string, Goal> {
  const map = new Map<string, Goal>();
  for (const r of readAll(goalsFile())) { const g = GoalUtils.fromDict(r); map.set(g.id, g); }
  return map;
}

export function getGoal(goalId: string): Goal | null { return loadGoals().get(goalId) ?? null; }

export function deleteGoal(goalId: string): boolean {
  const records = readAll(goalsFile());
  const toDelete = new Set<string>();
  const collect = (id: string) => {
    toDelete.add(id);
    records.forEach((r) => { if (r['parent_id'] === id) collect(r['id'] as string); });
  };
  collect(goalId);
  if (!records.some((r) => r['id'] === goalId)) return false;
  rewrite(goalsFile(), records.filter((r) => !toDelete.has(r['id'] as string)));
  const attemptRecords = readAll(attemptsFile());
  rewrite(attemptsFile(), attemptRecords.filter((r) => !toDelete.has(r['goal_id'] as string)));
  return true;
}

export function saveAttempt(attempt: Attempt): void {
  ensureDir();
  appendLine(attemptsFile(), AttemptUtils.toDict(attempt));
}

export function loadAttempts(): Attempt[] {
  return readAll(attemptsFile()).map((r) => AttemptUtils.fromDict(r));
}

export function attemptsForGoal(goalId: string): Attempt[] {
  return loadAttempts().filter((a) => a.goal_id === goalId);
}

export function saveKbEntry(entry: KBEntry): void {
  ensureDir();
  appendLine(kbFile(), KBEntryUtils.toDict(entry));
}

export function loadKb(): KBEntry[] {
  return readAll(kbFile()).map((r) => KBEntryUtils.fromDict(r));
}
