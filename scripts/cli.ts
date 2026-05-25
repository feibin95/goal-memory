import { Command } from 'commander';
import { GoalUtils, AttemptUtils, validateDdl } from '../src/lib/core/models';
import { saveGoal, loadGoals, getGoal, deleteGoal, saveAttempt, loadAttempts, getAvailableAttempts, getAttemptById, updateAttempt, deleteAttempt, nextAttemptSeq } from '../src/lib/core/store';
import { filterGoals, pickNext, candidateGoals } from '../src/lib/core/scheduler';
import { buildContextPack } from '../src/lib/core/context';
import { addEntry, search } from '../src/lib/core/kb';
import { getSessionGoal, saveSession, getSession, bindAttempt, releaseAttempt } from '../src/lib/core/session-store';
import { createAttemptFiles, formatAttemptFilesForContext, buildAttemptDirName } from '../src/lib/core/attempt-files';

function nowIso() { return new Date().toISOString(); }
function requireGoal(id: string) {
  const g = getGoal(id);
  if (!g) { console.error('Error: goal ' + id + ' not found.'); process.exit(1); }
  return g!;
}

const program = new Command();
program.name('goalmem').description('Goal memory runtime CLI').version('1.0.0');

program.command('create').description('Create a goal (omit --parent for a root goal)')
  .requiredOption('--title <title>').requiredOption('--background <background>')
  .option('--parent <goalId>', 'Parent goal ID (omit to create a root goal)')
  .option('--success-criteria <criteria>', '', '').option('--cost <n>', '', '3')
  .option('--deps <ids>', 'Comma-separated dependency goal IDs', '')
  .option('--ddl <date>')
  .action((opts) => {
    const parentIds = opts.parent ? [requireGoal(opts.parent).id] : [];
    const deps = opts.deps ? opts.deps.split(',').map((s: string) => s.trim()).filter(Boolean) : [];
    const draft = GoalUtils.create(opts.title, opts.background, { parentIds, dependencies: deps, cost: parseInt(opts.cost), successCriteria: opts.successCriteria, ddl: opts.ddl ?? null });
    draft.status = 'ready';
    if (parentIds.length > 0) {
      const err = validateDdl(draft, loadGoals());
      if (err) { console.error('Error: ' + err); process.exit(1); }
    }
    const goal = saveGoal(draft);
    console.log('Goal created: [' + goal.id + '] ' + goal.title);
  });

program.command('update <goalId>').description('Update goal fields')
  .option('--title <title>').option('--background <background>').option('--status <status>')
  .option('--cost <n>')
  .option('--note <text>').option('--clear-notes', 'remove all notes')
  .option('--add-deps <ids>', 'comma-separated IDs to add as dependencies')
  .option('--remove-deps <ids>', 'comma-separated IDs to remove from dependencies')
  .action((goalId, opts) => {
    const goal = requireGoal(goalId);
    if (opts.title !== undefined) goal.title = opts.title;
    if (opts.background !== undefined) goal.background = opts.background;
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

program.command('list').description('List goals')
  .option('--json', 'Output as JSON array')
  .option('--parent <goalId>', 'Filter by parent goal ID')
  .option('--actionable', 'Only show actionable goals, sorted by score')
  .action((opts) => {
    const goals = filterGoals({ parent_id: opts.parent, actionable: opts.actionable });
    if (opts.json) {
      console.log(JSON.stringify(goals.map(g => ({ id: g.id, status: g.status, title: g.title, ddl: g.ddl ?? null, ...((g as { score?: number }).score !== undefined ? { score: (g as { score?: number }).score } : {}) }))));
      return;
    }
    if (!goals.length) { console.log('No goals.'); return; }
    const hasScore = goals.some(g => (g as { score?: number }).score !== undefined);
    if (hasScore) {
      console.log('ID         STATUS       SCORE    DDL         TITLE');
      console.log('-'.repeat(75));
      for (const g of goals) {
        const score = String(((g as { score?: number }).score ?? 0).toFixed(2)).padEnd(8);
        console.log(g.id.padEnd(10) + ' ' + g.status.padEnd(12) + ' ' + score + ' ' + (g.ddl ?? '').padEnd(11) + g.title);
      }
    } else {
      console.log('ID         STATUS       DDL         TITLE');
      console.log('-'.repeat(70));
      for (const g of [...goals].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
        console.log(g.id.padEnd(10) + ' ' + g.status.padEnd(12) + ' ' + (g.ddl ?? '').padEnd(11) + (g.parent_ids?.length ? '  ' : '') + g.title);
      }
    }
  });

program.command('state').description('Show global state snapshot')
  .option('--json', 'Output as JSON')
  .action((opts) => {
    const goals = loadGoals();
    const next = pickNext();
    const inProgress = [...goals.values()].filter(g => g.status === 'in_progress');
    const actionable = candidateGoals(goals);
    if (opts.json) {
      console.log(JSON.stringify({
        next: next ? { id: next.goal.id, title: next.goal.title, score: next.explanation } : null,
        in_progress: inProgress.map(g => ({ id: g.id, title: g.title })),
        actionable_count: actionable.length,
        total: goals.size,
      }, null, 2));
      return;
    }
    console.log('Total: ' + goals.size + '  Actionable: ' + actionable.length + '  In-progress: ' + inProgress.length);
    if (next) console.log('Next:  [' + next.goal.id + '] ' + next.goal.title + ' (score=' + next.explanation.total + ')');
    if (inProgress.length) {
      console.log('In-progress:');
      for (const g of inProgress) console.log('  [' + g.id + '] ' + g.title);
    }
  });

program.command('show <goalId>').description('Show full detail of a goal')
  .option('--json', 'Output as raw JSON')
  .action((goalId, opts) => {
    const goal = requireGoal(goalId);
    if (opts.json) { console.log(JSON.stringify(goal, null, 2)); return; }
    console.log('ID:               ' + goal.id);
    console.log('Title:            ' + goal.title);
    console.log('Status:           ' + goal.status);
    console.log('Cost:             ' + goal.cost);
    console.log('DDL:              ' + (goal.ddl ?? '(none)'));
    console.log('Background:       ' + goal.background);
    console.log('Success Criteria: ' + (goal.success_criteria || '(none)'));
    console.log('Parent IDs:       ' + (goal.parent_ids.join(', ') || '(none)'));
    console.log('Dependencies:     ' + (goal.dependencies.join(', ') || '(none)'));
    if (goal.notes.length) console.log('Notes:\n' + goal.notes.map((n: string) => '  - ' + n).join('\n'));
  });

program.command('delete <goalId>').description('Delete a goal (cascades to orphaned children)')
  .action((goalId) => {
    const deleted = deleteGoal(goalId);
    if (!deleted) { console.error('Error: goal ' + goalId + ' not found.'); process.exit(1); }
    console.log('Deleted ' + goalId);
  });

program.command('context <goalId>').description('Generate context pack')
  .action((goalId) => {
    const pack = buildContextPack(goalId);
    if (!pack) { console.error('Error: goal not found.'); process.exit(1); }
    console.log(pack);
  });

const attempt = program.command('attempt').description('Manage execution attempts');

attempt.command('create <goalId>').description('Create an active attempt with planning files')
  .option('--hypothesis <text>', 'Initial hypothesis', '')
  .action((goalId, opts) => {
    const goal = requireGoal(goalId);
    const seq = nextAttemptSeq(goal.id);
    const dirName = buildAttemptDirName(goal.title, seq);
    const filesDir = createAttemptFiles(dirName, goal);
    const a = saveAttempt(AttemptUtils.createActive(goal.id, filesDir, opts.hypothesis));
    console.log(JSON.stringify({ attemptId: a.id, filesDir }));
  });

attempt.command('update <attemptId>').description('Update attempt fields (set --status completed to finish)')
  .option('--status <status>', 'New status: active | completed')
  .option('--action <text>').option('--result <text>').option('--gradient <number>')
  .action((attemptId, opts) => {
    const patch: Record<string, unknown> = {};
    if (opts.status !== undefined) patch.status = opts.status;
    if (opts.action !== undefined) patch.action = opts.action;
    if (opts.result !== undefined) patch.result = opts.result;
    if (opts.gradient !== undefined) patch.gradient = parseFloat(opts.gradient);
    const ok = updateAttempt(attemptId, patch);
    if (!ok) { console.error('Error: attempt ' + attemptId + ' not found.'); process.exit(1); }
    console.log('Attempt [' + attemptId + '] updated.');
  });

attempt.command('list <goalId>').description('List attempts for a goal')
  .option('--available', 'Only show active attempts not owned by any live session')
  .option('--json', 'Output as JSON array')
  .action((goalId, opts) => {
    const attempts = opts.available ? getAvailableAttempts(goalId) : loadAttempts().filter(a => a.goal_id === goalId);
    if (opts.json) { console.log(JSON.stringify(attempts)); return; }
    if (!attempts.length) { console.log('No attempts.'); return; }
    console.log('ID         STATUS       CREATED              HYPOTHESIS');
    console.log('-'.repeat(75));
    for (const a of attempts)
      console.log(a.id.padEnd(10) + ' ' + a.status.padEnd(12) + ' ' + a.created_at.slice(0, 19) + '  ' + (a.hypothesis ?? '').slice(0, 40));
  });

attempt.command('get <attemptId>').description('Show attempt detail')
  .option('--files', 'Include planning file contents')
  .action((attemptId, opts) => {
    const a = getAttemptById(attemptId);
    if (!a) { console.error('Error: attempt ' + attemptId + ' not found.'); process.exit(1); }
    console.log(JSON.stringify(a, null, 2));
    if (opts.files) {
      const files = formatAttemptFilesForContext(attemptId, a.files_dir);
      if (files) console.log('\n' + files);
    }
  });

attempt.command('delete <attemptId>').description('Delete an attempt')
  .action((attemptId) => {
    const ok = deleteAttempt(attemptId);
    if (!ok) { console.error('Error: attempt ' + attemptId + ' not found.'); process.exit(1); }
    console.log('Deleted ' + attemptId);
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
session.command('release-attempt <sessionKey>').description('Clear attempt binding for a session (on session end)')
  .action((sessionKey) => {
    releaseAttempt(sessionKey);
    console.log('Session ' + sessionKey + ': attempt binding released.');
  });

program.parseAsync(process.argv).catch((err: Error) => { console.error(err); process.exit(1); });
