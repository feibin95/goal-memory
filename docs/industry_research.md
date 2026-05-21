# Industry Research: Goal + Gradient Memory Runtime

Date: 2026-05-20

## Short Conclusion

There are strong existing tools for pieces of this system:

- Task decomposition and AI-friendly task management: Task Master.
- Stateful execution, checkpoints, human-in-the-loop, replay: LangGraph.
- Agent memory hierarchy and self-editing memory: MemGPT / Letta.
- Long-term memory APIs: Mem0, Zep, Supermemory, CrewAI Memory.
- Agent runtime extensibility and tool discovery: Claude Code MCP / skills / hooks.

But the proposed system's core loop is still distinct:

> Goal graph gives direction. Attempts produce gradient. Gradients update future scheduling and sometimes rewrite the goal tree.

Most existing systems stop at "remember facts" or "track tasks." They do not make learned execution signals first-class scheduling inputs.

## Reference Map

| Area | References | What to Borrow |
|---|---|---|
| AI task management | Task Master | PRD-to-task decomposition, dependencies, next-task, MCP/CLI interface, token-aware tool loading |
| Stateful agent execution | LangGraph | Checkpoints, replay/time travel, human-in-the-loop gates, fault-tolerant execution |
| Memory hierarchy | MemGPT / Letta | Core vs recall vs archival memory, self-directed memory edits, context-window awareness |
| Long-term memory APIs | Mem0, Zep, Supermemory, CrewAI Memory | Layered memory, graph memory, semantic/recency/importance scoring, MCP memory layer |
| Coding-agent runtime | Claude Code / MCP | Lazy tool discovery, permissions, append-oriented session storage, skills/hooks |
| Security | SuperLocalMemory / MCP security papers | Provenance, trust scoring, memory poisoning isolation, local-first storage |

## Useful Patterns

### 1. Separate Goal State From Memory State

Do not make "memory" the source of truth for work state. Use explicit goal/task records for:

- status
- dependencies
- parent/child structure
- success criteria
- assignment state

Use memory for:

- attempts
- observations
- reusable lessons
- context snippets
- procedures

### 2. Keep an Append-Only Event Log

Several systems point toward append-oriented state and replayability. The goal runtime should store raw events:

- goal_created
- goal_started
- attempt_recorded
- gradient_created
- gradient_applied
- goal_completed

Materialized goal state can be rebuilt from the log later.

### 3. Use Progressive Disclosure

OpenAI Agents SDK memory docs and Letta/MemGPT both emphasize small summaries first, deeper retrieval later.

For our system:

- Level 0: active goal + parent chain
- Level 1: success criteria + dependencies + current scheduler reason
- Level 2: recent attempts + gradients + KB hits
- Level 3: raw event log and full files

### 4. Treat Memory Types Differently

Borrow the semantic / episodic / procedural split:

- Semantic: domain facts, architecture decisions, project knowledge.
- Episodic: attempts, failures, successes, session history.
- Procedural: reusable ways of doing work, scripts, playbooks.

Gradients are closest to procedural + episodic memory: they emerge from episodes but should affect future procedure.

### 5. Make Scheduling Explainable

Task Master's "next task" and CrewAI's composite memory scoring both suggest the score must be visible.

`goal next --explain` should always show:

- readiness
- dependency blocking
- priority
- parent contribution
- unblock value
- cost
- relevant gradient
- memory freshness / confidence, later

### 6. Human Gates for Structural Changes

A gradient may suggest:

- raise priority
- split goal
- obsolete goal
- create dependency
- rewrite success criteria

Only safe, reversible updates should auto-apply. Structural goal-tree rewrites should be proposed and approved.

### 7. Use MCP Eventually, But Keep CLI First

MCP is the right integration layer for Claude Code/Cursor/OpenClaw, but Task Master docs explicitly optimize tool loading to avoid context blowup. Claude Code now also defers MCP tools and discovers them on demand.

Recommendation:

1. Keep the local CLI as the core.
2. Add a thin MCP adapter later.
3. Keep tool surface small: `next`, `context`, `attempt`, `gradient`, `complete`.

### 8. Do Not Trust Memory Blindly

Persistent memory creates memory-poisoning risk.

Each memory/gradient should carry:

- source: user-stated | observed | inferred | agent-generated
- evidence links
- confidence
- timestamp
- originating goal/attempt IDs
- applied status

Cross-project memory should default to read-only or off.

## Best-Practice Architecture for Our Next Iteration

```text
goal-memory-runtime/
  Goal Graph
    goals, dependencies, statuses, success criteria

  Event Log
    append-only source of truth

  Scheduler
    next goal = readiness + value + gradient + cost

  Context Pack Builder
    progressive disclosure over goal chain + memory

  Memory Store
    semantic / episodic / procedural

  Gradient Extractor
    attempts -> learning signal -> proposed update

  Human Gate
    approves structural updates

  Integration Layer
    CLI first, MCP later
```

## Recommended Near-Term Changes to This Demo

1. Add `goalmem reflect <goal_id>`.
   - Reads attempts.
   - Produces one or more gradient candidates.
   - Keeps application explicit.

2. Add `events.jsonl`.
   - Preserve raw history instead of only current JSONL tables.

3. Add memory type and provenance.
   - `source`, `confidence`, `evidence`, `memory_type`.

4. Add gradient actions beyond priority.
   - `raise-priority`
   - `add-note`
   - `propose-child-goal`
   - `propose-dependency`
   - `mark-obsolete`

5. Add `goal review`.
   - Shows unapplied gradients and asks which should modify the goal tree.

6. Consider importing/exporting Task Master tasks later.
   - This avoids competing directly with Task Master for basic task management.

## Sources

- Task Master MCP tools: https://docs.task-master.dev/capabilities/mcp
- Task Master GitHub owner/project listing: https://github.com/eyaltoledano
- LangGraph persistence: https://langchain-5e9cc07a.mintlify.app/oss/python/langgraph/persistence
- AutoGen memory protocol: https://microsoft.github.io/autogen/dev/user-guide/agentchat-user-guide/memory.html
- CrewAI Memory: https://docs.crewai.com/en/concepts/memory
- Mem0 memory types: https://docs.mem0.ai/core-concepts/memory-types
- Zep memory docs: https://help.getzep.com/v2/memory
- OpenAI Agents SDK memory: https://openai.github.io/openai-agents-python/sandbox/memory/
- Claude Code MCP docs: https://code.claude.com/docs/en/mcp
- Supermemory MCP: https://supermemory.ai/docs/supermemory-mcp/introduction
- Claude Code architecture paper: https://arxiv.org/abs/2604.14228
- MemGPT paper: https://shishirpatil.github.io/publications/memgpt-2023.pdf
- SuperLocalMemory paper: https://arxiv.org/abs/2603.02240
- Storage Is Not Memory paper: https://arxiv.org/abs/2605.04897
