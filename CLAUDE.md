# goal-memory — 架构规范

## Hook 数据访问规范

**Hooks 只能通过 CLI 访问目标数据，禁止直接操作 `~/.goal-memory/data.db`。**

```
✅ execSync(`tsx scripts/cli.ts session get <key>`)
✅ execSync(`tsx scripts/cli.ts list`)
✅ execSync(`tsx scripts/cli.ts context <goalId>`)
❌ new Database('~/.goal-memory/data.db')  // 绕过 CLI 直接查库
```

唯一的例外：读取 hook 输入中的会话标识字段（Claude 的 `transcript_path`、Codex 的 `session_id`）。这些字段只用于派生 session key，不是目标数据层。

**原因**：CLI 是数据层的唯一公共接口，内含过期清理、向后兼容等逻辑。绕过 CLI 直接读库会跳过这些保障，且导致两处维护同一份读取逻辑。

## 数据层结构

```
~/.goal-memory/
  data.db          # SQLite 数据库（better-sqlite3），包含 goals / attempts / kb_entries / sessions 表
```

数据库通过 `src/lib/core/db.ts` 初始化，所有数据层模块位于 `src/lib/core/`，CLI 入口为 `scripts/cli.ts`，MCP 工具入口为 `mcp/server.ts`。Claude hook 配置在 `hooks/`，Codex hook 配置在 `.codex/`，共享工具脚本在 `plugin/`。
