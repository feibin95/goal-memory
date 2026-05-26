# goalmem — Goal Memory Runtime Demo

A local CLI that proves the **goal + gradient memory** loop:

> Goal graph gives direction → attempts produce gradient signals → gradients alter future scheduling and context.

No external API. State lives in `.goal-memory/` as JSONL files.

A Python reference implementation remains under `goalmem/` for historical comparison.

---

## TypeScript Architecture

TypeScript is the primary implementation. Source layout:

- `src/core/models.ts` — Domain models
- `src/core/store.ts` — JSONL storage
- `src/core/scheduler.ts` — Scheduling algorithm
- `src/core/context.ts` — Context pack builder
- `src/core/kb.ts` — Knowledge base
- `src/cli.ts` — CLI entrypoint
- `src/server.ts` — API + static file server
- `src/public/` — Browser UI

### npm commands

- `npm run dev` — dev server (tsx) at http://localhost:3000 by default
- `npm run cli -- <command>` — run CLI without building
- `npm test` — run 21 vitest tests
- `npm run build` — compile TypeScript to dist/ via tsconfig.build.json
- `npm start` — start compiled server

### TypeScript config

- `tsconfig.json` — IDE + type-check; noEmit:true; includes src and tests
- `tsconfig.build.json` — build only; rootDir:src; outDir:dist

---

## Quick Start — Web UI

Start the local API + browser UI:

```bash
npm install
npm run dev        # tsx src/server.ts — starts at http://localhost:3000
```

Use another port when needed:

```bash
PORT=3317 npm run dev
```

Or with the compiled build:

```bash
npm run build
npm start          # node dist/server.js
```

Open **http://localhost:3000** in a browser, or the port you set with `PORT`.
The UI shows:

- **Left panel** — full goal tree with status badges, priority, colour-coded selection.
- **Centre panel** — selected goal: title, status, priority, cost, why, success criteria, dependencies, notes, plus action buttons (Start / Complete / Block / Record Attempt / Add Gradient / Context Pack).
- **Right panel** — next recommended goal with score breakdown, recent attempts, gradient list with one-click Apply.

Actions available from the UI:

| Action | How |
|---|---|
| Create root goal | "New Root" button in the header |
| Add child goal | "Add Child" button in centre panel |
| Start / Complete / Block | Action bar in centre panel |
| Record attempt | "Record Attempt" button |
| Add gradient | "Add Gradient" button |
| Apply gradient | "Apply" button in right panel |
| View / copy context pack | "Context Pack" button |
| Refresh | "Refresh" in header |

---

## Quick Start (TypeScript CLI)

```bash
npm install
npm run goalmem -- --help
```

or after building:

```bash
npm run build
node dist/cli.js --help
```

---

## Agent Hooks

GoalMem can inject the active goal context into coding-agent sessions.

- Claude Code uses `.claudecode/hooks/hooks.json`.
- Codex uses `.codex/hooks.json`.
- Both paths reuse `plugin/build-state-context.cjs`, and hooks read GoalMem state only through `scripts/cli.ts`.

Codex hooks are wired for `SessionStart`, `UserPromptSubmit`, and `PostToolUse`. The Codex session key comes from the hook payload `session_id`; bind it with the MCP tool:

```text
bind_session(sessionKey="<codex session_id>", goalId="<goal id>")
create_attempt(goalId="<goal id>", sessionKey="<codex session_id>")
```

For hook diagnostics, the CLI also exposes:

```bash
npm run goalmem -- attempt available <GOAL_ID>
npm run goalmem -- attempt files <ATTEMPT_ID>
```

---

## Copy-Paste Demo Flow (TypeScript)

```bash
# 1. Create a root goal
npm run goalmem -- init \
  --title "Ship v1 of the CLI" \
  --why "Prove the goal-memory concept end-to-end" \
  --priority 9

# 2. Add child goals (use the IDs printed above)
npm run goalmem -- add \
  --parent <ROOT_ID> \
  --title "Write core models" \
  --why "Everything else depends on data structures" \
  --criteria "All model classes serialize correctly" \
  --priority 8

npm run goalmem -- add \
  --parent <ROOT_ID> \
  --title "Write CLI entrypoints" \
  --why "User needs a way to interact" \
  --criteria "All required commands work" \
  --priority 7 \
  --deps <MODELS_GOAL_ID>

# 3. List goals
npm run goalmem -- list

# 4. Pick next actionable goal with explanation
npm run goalmem -- next --explain

# 5. Start work on a goal
npm run goalmem -- start <GOAL_ID>

# 6. Record attempts while working
npm run goalmem -- attempt <GOAL_ID> \
  --hypothesis "Using interfaces will be cleaner than dicts" \
  --action "Modelled all domain objects as TS interfaces" \
  --result "All tests pass; code is 30% shorter" \
  --evidence "tests/core.test.ts green" \
  --outcome success

# 7. Add a gradient from those attempts
npm run goalmem -- gradient add <GOAL_ID> \
  --insight "TS interfaces + utility objects are sufficient" \
  --implication "Future goals should default to stdlib TS, avoid heavy libs" \
  --strength high \
  --target-goal <CLI_GOAL_ID> \
  --suggested-action "raise-priority"

# 8. See that the gradient boosts the CLI goal in scheduling
npm run goalmem -- next --explain

# 9. Apply the gradient — priority is raised, insight is appended
npm run goalmem -- gradient apply <GRADIENT_ID>

# 10. Verify the target goal changed
npm run goalmem -- list

# 11. Generate a context pack for an agent
npm run goalmem -- context <GOAL_ID>

# 12. Complete a goal
npm run goalmem -- complete <GOAL_ID> --evidence "PR merged"

# 13. KB operations
npm run goalmem -- kb add \
  --title "Prefer TS interfaces" \
  --body "Use TypeScript interfaces for domain models. Only reach for class hierarchies when behaviour must be encapsulated." \
  --tags "typescript,design"

npm run goalmem -- kb search "interface"

# 14. Block a goal
npm run goalmem -- block <GOAL_ID> --reason "Waiting for upstream dependency"
```

---

## Commands Reference

| Command | Purpose |
|---|---|
| `init` | Create root goal |
| `add` | Add child goal with optional deps |
| `list` | Show all goals |
| `next --explain` | Pick next actionable goal with score breakdown |
| `context <id>` | Generate markdown context pack for an agent |
| `start <id>` | Mark goal in_progress |
| `complete <id>` | Mark goal done |
| `block <id>` | Mark goal blocked |
| `attempt <id>` | Record a work attempt |
| `gradient add <id>` | Add a gradient signal |
| `gradient apply <id>` | Apply gradient to target goal |
| `kb add` | Add KB entry |
| `kb search <query>` | Full-text KB search |

---

## Scheduler Scoring

`next` scores candidate goals (leaf, non-blocked, deps-done) as:

```
score = priority
      + 0.5 × parent_avg_priority
      + 2.0 × unblock_value
      - 0.5 × cost
      + gradient_boost   # +2 high, +1 medium, +0.5 low per unapplied gradient
```

`--explain` prints each component so you can see exactly why a goal was chosen.

---

## Storage

All state is stored in `.goal-memory/` as JSONL files:

```
.goal-memory/
  goals.jsonl
  attempts.jsonl
  gradients.jsonl
  kb.jsonl
```

---

## Tests

**TypeScript (primary):**

```bash
npm test
```

21 tests in `tests/core.test.ts` covering dependency readiness, scheduler scoring,
gradient boost / application, context pack generation, and KB search.

**Python Reference (legacy):**

```bash
python -m pytest tests/test_core.py -v
```

22 tests remain in `tests/test_core.py`.
