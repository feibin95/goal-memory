import { Command } from 'commander';
import { GoalUtils, AttemptUtils, validateDdl } from '../src/lib/core/models';
import { saveGoal, loadGoals, getGoal, saveAttempt, getActiveAttempt, getAvailableAttempts, getAttemptById, updateAttempt } from '../src/lib/core/store';
import { pickNext } from '../src/lib/core/scheduler';
import { buildContextPack } from '../src/lib/core/context';
import { addEntry, search } from '../src/lib/core/kb';
import { getSessionGoal, saveSession, getSession, bindAttempt } from '../src/lib/core/session-store';
import { createAttemptFiles, formatAttemptFilesForContext } from '../src/lib/core/attempt-files';

function nowIso() { return new Date().toISOString(); }
function requireGoal(id: string) {
  const g = getGoal(id);
  if (!g) { console.error('Error: goal ' + id + ' not found.'); process.exit(1); }
  return g!;
}

const program = new Command();
program.name('goalmem').description('Goal memory runtime CLI').version('1.0.0');

program.command('init').description('Create root goal')
  .requiredOption('--title <title>').requiredOption('--background <background>')
  .option('--success-criteria <criteria>', '', '').option('--cost <n>', '', '3')
  .option('--ddl <date>')
  .action((opts) => {
    const goal = GoalUtils.create(opts.title, opts.background, { cost: parseInt(opts.cost), successCriteria: opts.successCriteria, ddl: opts.ddl ?? null });
    goal.status = 'ready';
    saveGoal(goal);
    console.log('Root goal created: [' + goal.id + '] ' + goal.title);
  });

program.command('add').description('Add child goal')
  .requiredOption('--parent <goalId>').requiredOption('--title <title>').requiredOption('--background <background>')
  .option('--success-criteria <criteria>', '', '').option('--cost <n>', '', '3').option('--deps <ids>', '', '')
  .option('--ddl <date>')
  .action((opts) => {
    const parent = requireGoal(opts.parent);
    const deps = opts.deps ? opts.deps.split(',').map((s: string) => s.trim()).filter(Boolean) : [];
    const goal = GoalUtils.create(opts.title, opts.background, { parentIds: [parent.id], dependencies: deps, cost: parseInt(opts.cost), successCriteria: opts.successCriteria, ddl: opts.ddl ?? null });
    goal.status = 'ready';
    const goals = loadGoals(); goals.set(goal.id, goal);
    const err = validateDdl(goal, goals);
    if (err) { console.error('Error: ' + err); process.exit(1); }
    saveGoal(goal);
    console.log('Goal added: [' + goal.id + '] ' + goal.title);
  });

program.command('update <goalId>').description('Update goal fields')
  .option('--title <title>').option('--status <status>')
  .option('--cost <n>')
  .option('--note <text>').option('--clear-notes', 'remove all notes')
  .option('--add-deps <ids>', 'comma-separated IDs to add as dependencies')
  .option('--remove-deps <ids>', 'comma-separated IDs to remove from dependencies')
  .action((goalId, opts) => {
    const goal = requireGoal(goalId);
    if (opts.title !== undefined) goal.title = opts.title;
    if (opts.status !== undefined) goal.status = opts.status;
    if (opts.cost !== undefined) goal.cost = parseInt(opts.cost);
    if (opts.clearNotes) goal.notes = [];
    if (opts.note) goal.notes.push(opts.note);
    if (opts.addDeps) {
      const ids = opts.addDeps.split(',').map((s: string) => s.trim()).filter(Boolean);
      goal.dependencies = [...new Set([...goal.dependencies, ...ids])];
    }
    if (opts.removeDeps) {
      const ids = new Set(opts.removeDeps.split(',').map((s: string) => s.trim()).filter(Boolean));
      goal.dependencies = goal.dependencies.filter((id: string) => !ids.has(id));
    }
    goal.updated_at = nowIso();
    saveGoal(goal);
    console.log('Goal [' + goal.id + '] updated. dependencies: [' + goal.dependencies.join(', ') + ']');
  });

program.command('list').description('List all goals')
  .option('--json', 'Output as JSON array')
  .action((opts) => {
    const goals = loadGoals();
    if (opts.json) {
      console.log(JSON.stringify([...goals.values()].map(g => ({ id: g.id, status: g.status, title: g.title, ddl: g.ddl ?? null }))));
      return;
    }
    if (goals.size === 0) { console.log('No goals.'); return; }
    console.log('ID         STATUS       DDL         TITLE');
    console.log('-'.repeat(70));
    for (const g of [...goals.values()].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
      console.log(g.id.padEnd(10) + ' ' + g.status.padEnd(12) + ' ' + (g.ddl ?? '').padEnd(11) + (g.parent_ids?.length ? '  ' : '') + g.title);
    }
  });

program.command('next').description('Pick next actionable goal')
  .option('--explain').action((opts) => {
    const result = pickNext();
    if (!result) { console.log('No actionable goals found.'); return; }
    console.log('Next goal: [' + result.goal.id + '] ' + result.goal.title);
    if (opts.explain) for (const [k, v] of Object.entries(result.explanation)) console.log('  ' + k + ': ' + v);
  });

program.command('context <goalId>').description('Generate context pack')
  .action((goalId) => {
    const pack = buildContextPack(goalId);
    if (!pack) { console.error('Error: goal not found.'); process.exit(1); }
    console.log(pack);
  });

program.command('record-attempt <goalId>').description('Record a completed attempt')
  .requiredOption('--hypothesis <text>').requiredOption('--action <text>')
  .requiredOption('--result <text>').option('--gradient <number>')
  .action((goalId, opts) => {
    const goal = requireGoal(goalId);
    const gradient = opts.gradient != null ? parseFloat(opts.gradient) : null;
    const attempt = AttemptUtils.create(goal.id, opts.hypothesis, opts.action, opts.result, gradient);
    saveAttempt(attempt);
    console.log('Attempt [' + attempt.id + '] recorded.');
  });

const attempt = program.command('attempt').description('Manage execution attempts');

attempt.command('create <goalId>').description('Create an active attempt with planning files')
  .option('--hypothesis <text>', 'Initial hypothesis', '')
  .action((goalId, opts) => {
    const goal = requireGoal(goalId);
    const id = crypto.randomUUID().slice(0, 8);
    const filesDir = createAttemptFiles(id, goal);
    const a = AttemptUtils.createActive(goal.id, filesDir, opts.hypothesis, id);
    saveAttempt(a);
    console.log(JSON.stringify({ attemptId: id, filesDir }));
  });

attempt.command('complete <attemptId>').description('Mark an attempt as completed')
  .requiredOption('--action <text>').requiredOption('--result <text>').option('--gradient <number>')
  .action((attemptId, opts) => {
    const gradient = opts.gradient != null ? parseFloat(opts.gradient) : null;
    const ok = updateAttempt(attemptId, { status: 'completed', action: opts.action, result: opts.result, ...(gradient !== null ? { gradient } : {}) });
    if (!ok) { console.error('Error: attempt ' + attemptId + ' not found.'); process.exit(1); }
    console.log('Attempt [' + attemptId + '] completed.');
  });

attempt.command('active <goalId>').description('Get the active attempt for a goal (JSON)')
  .action((goalId) => {
    const a = getActiveAttempt(goalId);
    console.log(a ? JSON.stringify(a) : '');
  });

attempt.command('available <goalId>').description('List active attempts not owned by any live session')
  .action((goalId) => {
    console.log(JSON.stringify(getAvailableAttempts(goalId)));
  });

attempt.command('files <attemptId>').description('Show planning file content for an attempt')
  .action((attemptId) => {
    const a = getAttemptById(attemptId);
    if (!a) { console.error('Error: attempt ' + attemptId + ' not found.'); process.exit(1); }
    console.log(formatAttemptFilesForContext(attemptId, a.files_dir));
  });

const kb = program.command('kb');
kb.command('add').requiredOption('--title <title>').requiredOption('--body <body>').option('--tags <tags>', '', '')
  .action((opts) => {
    const entry = addEntry(opts.title, opts.body, opts.tags ? opts.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : []);
    console.log('KB entry [' + entry.id + '] added.');
  });
kb.command('search <query>').action((query) => {
  const results = search(query);
  if (!results.length) { console.log('No KB entries matched.'); return; }
  for (const e of results) console.log('[' + e.id + '] ' + e.title + '\n  ' + e.body.slice(0, 120) + '\n');
});

const session = program.command('session');
session.command('get <sessionKey>').description('Get bound goal ID for a session (empty if none)')
  .action((sessionKey) => {
    const goalId = getSessionGoal(sessionKey);
    console.log(goalId ?? '');
  });
session.command('get-full <sessionKey>').description('Get session record as JSON {goal_id, attempt_id}')
  .action((sessionKey) => {
    const s = getSession(sessionKey);
    console.log(s ? JSON.stringify({ goal_id: s.goal_id, attempt_id: s.attempt_id ?? null }) : '{}');
  });
session.command('bind <sessionKey> <goalId>').description('Bind a session to a goal')
  .action((sessionKey, goalId) => {
    const goal = getGoal(goalId);
    if (!goal) { console.error('Error: goal ' + goalId + ' not found.'); process.exit(1); }
    saveSession(sessionKey, goalId);
    console.log('Session bound: ' + sessionKey + ' -> [' + goalId + '] ' + goal.title);
  });
session.command('bind-attempt <sessionKey> <attemptId>').description('Bind a session to an attempt')
  .action((sessionKey, attemptId) => {
    const a = getAttemptById(attemptId);
    if (!a) { console.error('Error: attempt ' + attemptId + ' not found.'); process.exit(1); }
    bindAttempt(sessionKey, attemptId);
    console.log('Session ' + sessionKey + ' bound to attempt [' + attemptId + '].');
  });

program.parseAsync(process.argv).catch((err: Error) => { console.error(err); process.exit(1); });
