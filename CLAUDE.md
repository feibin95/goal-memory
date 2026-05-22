# goal-memory-demo — 架构规范

## Hook 数据访问规范

**Hooks 只能通过 CLI 访问目标数据，禁止直接读写 `.goal-memory/` 下的 JSONL 文件。**

```
✅ execSync(`tsx scripts/cli.ts session get <key>`)
✅ execSync(`tsx scripts/cli.ts list`)
✅ execSync(`tsx scripts/cli.ts context <goalId>`)
❌ fs.readFileSync('.goal-memory/sessions.jsonl')
❌ fs.readFileSync('.goal-memory/goals.jsonl')
```

唯一的例外：读取 hook 输入中的 `transcript_path` 文件（这是 Claude harness 传入的会话 transcript，不是目标数据层）。

**原因**：CLI 是数据层的唯一公共接口，内含过期清理、向后兼容等逻辑。绕过 CLI 直接读文件会跳过这些保障，且导致两处维护同一份读取逻辑。

## 数据层结构

```
.goal-memory/
  goals.jsonl      # 目标（通过 src/lib/core/store.ts 访问）
  attempts.jsonl   # 尝试记录
  kb.jsonl         # 知识库
  sessions.jsonl   # 会话-目标绑定（通过 src/lib/core/session-store.ts 访问）
```

所有数据层模块位于 `src/lib/core/`，CLI 入口为 `scripts/cli.ts`，MCP 工具入口为 `mcp/server.ts`。
