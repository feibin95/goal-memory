import { Command } from 'commander';
import { GoalUtils, AttemptUtils, validateDdl } from '../src/lib/core/models';
import { saveGoal, loadGoals, getGoal, saveAttempt } from '../src/lib/core/store';
import { pickNext } from '../src/lib/core/scheduler';
import { buildContextPack } from '../src/lib/core/context';
import { addEntry, search } from '../src/lib/core/kb';

function nowIso() { return new Date().toISOString(); }
function requireGoal(id: string) {
  const g = getGoal(id);
  if (!g) { console.error('Error: goal ' + id + ' not found.'); process.exit(1); }
  return g!;
}

const program = new Command();
program.name('goalmem').description('Goal memory runtime CLI').version('1.0.0');

program.command('init').description('Create root goal')
  .requiredOption('--title <title>').requiredOption('--description <description>')
  .option('--criteria <criteria>', '', '').option('--cost <n>', '', '3')
  .option('--ddl <date>')
  .action((opts) => {
    const goal = GoalUtils.create(opts.title, opts.description, { cost: parseInt(opts.cost), successCriteria: opts.criteria, ddl: opts.ddl ?? null });
    goal.status = 'ready';
    saveGoal(goal);
    console.log('Root goal created: [' + goal.id + '] ' + goal.title);
  });

program.command('add').description('Add child goal')
  .requiredOption('--parent <goalId>').requiredOption('--title <title>').requiredOption('--description <description>')
  .option('--criteria <criteria>', '', '').option('--cost <n>', '', '3').option('--deps <ids>', '', '')
  .option('--ddl <date>')
  .action((opts) => {
    const parent = requireGoal(opts.parent);
    const deps = opts.deps ? opts.deps.split(',').map((s: string) => s.trim()).filter(Boolean) : [];
    const goal = GoalUtils.create(opts.title, opts.description, { parentId: parent.id, dependencies: deps, cost: parseInt(opts.cost), successCriteria: opts.criteria, ddl: opts.ddl ?? null });
    goal.status = 'ready';
    const goals = loadGoals(); goals.set(goal.id, goal);
    const err = validateDdl(goal, goals);
    if (err) { console.error('Error: ' + err); process.exit(1); }
    saveGoal(goal);
    console.log('Goal added: [' + goal.id + '] ' + goal.title);
  });

program.command('list').description('List all goals')
  .action(() => {
    const goals = loadGoals();
    if (goals.size === 0) { console.log('No goals.'); return; }
    console.log('ID         STATUS       DDL         TITLE');
    console.log('-'.repeat(70));
    for (const g of [...goals.values()].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
      console.log(g.id.padEnd(10) + ' ' + g.status.padEnd(12) + ' ' + (g.ddl ?? '').padEnd(11) + (g.parent_id ? '  ' : '') + g.title);
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

program.command('start <goalId>').action((goalId) => {
  const goal = requireGoal(goalId); goal.status = 'in_progress'; goal.updated_at = nowIso(); saveGoal(goal);
  console.log('Goal [' + goal.id + '] started.');
});

program.command('complete <goalId>').option('--evidence <text>', '', '')
  .action((goalId, opts) => {
    const goal = requireGoal(goalId); goal.status = 'done'; goal.updated_at = nowIso();
    if (opts.evidence) goal.notes.push('[done] ' + opts.evidence);
    saveGoal(goal); console.log('Goal [' + goal.id + '] done.');
  });


program.command('attempt <goalId>')
  .requiredOption('--hypothesis <text>').requiredOption('--action <text>')
  .requiredOption('--result <text>').option('--gradient <number>')
  .action((goalId, opts) => {
    const goal = requireGoal(goalId);
    const gradient = opts.gradient != null ? parseFloat(opts.gradient) : null;
    const attempt = AttemptUtils.create(goal.id, opts.hypothesis, opts.action, opts.result, gradient);
    saveAttempt(attempt);
    console.log('Attempt [' + attempt.id + '] recorded.');
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

program.parseAsync(process.argv).catch((err: Error) => { console.error(err); process.exit(1); });
