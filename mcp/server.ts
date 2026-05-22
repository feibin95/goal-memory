import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { setBaseDir, loadGoals, getGoal, saveGoal, saveAttempt, saveKbEntry } from "../src/lib/core/store.js";
import { pickNext, candidateGoals } from "../src/lib/core/scheduler.js";
import { buildContextPack } from "../src/lib/core/context.js";
import { search } from "../src/lib/core/kb.js";
import { GoalUtils, AttemptUtils, KBEntryUtils } from "../src/lib/core/models.js";
import { saveSession, getSessionGoal, setSessionBaseDir } from "../src/lib/core/session-store.js";
import { fileURLToPath } from "node:url";
import path from "node:path";

const PROJECT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
setBaseDir(PROJECT_DIR);
setSessionBaseDir(PROJECT_DIR);

const server = new McpServer({ name: "goal-memory", version: "1.0.0" });

server.registerTool(
  "get_next_goal",
  { description: "获取当前优先级最高的可执行目标（含评分说明）" },
  async () => {
    const result = pickNext();
    if (!result) return { content: [{ type: "text", text: "No actionable goals found." }] };
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ goal: result.goal, explanation: result.explanation }, null, 2),
      }],
    };
  }
);

server.registerTool(
  "get_goal_context",
  {
    description: "生成目标的完整上下文包（含祖先路径、依赖项、近期尝试、知识库片段），供 AI 执行任务时注入背景。若只需查看目标字段，请用 get_goal_detail。",
    inputSchema: { goalId: z.string().describe("目标 ID") },
  },
  async ({ goalId }) => {
    const pack = buildContextPack(goalId);
    if (!pack) return { content: [{ type: "text", text: `Goal not found: ${goalId}` }] };
    return { content: [{ type: "text", text: pack }] };
  }
);

server.registerTool(
  "get_goal_detail",
  {
    description: "获取目标的原始字段数据（id、title、background、status、cost、ddl、success_criteria、parent_ids、dependencies、notes 等）",
    inputSchema: { goalId: z.string().describe("目标 ID") },
  },
  async ({ goalId }) => {
    const goal = getGoal(goalId);
    if (!goal) return { content: [{ type: "text", text: `Goal not found: ${goalId}` }] };
    return { content: [{ type: "text", text: JSON.stringify(goal, null, 2) }] };
  }
);

server.registerTool(
  "list_goals",
  { description: "列出所有目标，含状态、优先级和层级关系" },
  async () => {
    const goals = [...loadGoals().values()];
    return { content: [{ type: "text", text: JSON.stringify(goals, null, 2) }] };
  }
);

server.registerTool(
  "list_actionable_goals",
  { description: "列出当前可执行的叶子目标（status=ready，所有依赖已完成）" },
  async () => {
    const goals = loadGoals();
    const candidates = candidateGoals(goals);
    if (!candidates.length) return { content: [{ type: "text", text: "No actionable goals." }] };
    return { content: [{ type: "text", text: JSON.stringify(candidates, null, 2) }] };
  }
);


server.registerTool(
  "record_attempt",
  {
    description: "记录一次工作尝试（假设-行动-结果循环）",
    inputSchema: {
      goalId: z.string().describe("目标 ID"),
      hypothesis: z.string().describe("本次尝试的假设"),
      action: z.string().describe("实际执行的行动"),
      result: z.string().describe("观察到的结果"),
      gradient: z.number().nullable().optional().describe("梯度/进展评分（可选）"),
    },
  },
  async ({ goalId, hypothesis, action, result, gradient }) => {
    const goal = getGoal(goalId);
    if (!goal) return { content: [{ type: "text", text: `Goal not found: ${goalId}` }] };
    const attempt = AttemptUtils.create(goalId, hypothesis, action, result, gradient ?? null);
    saveAttempt(attempt);
    return { content: [{ type: "text", text: `Attempt [${attempt.id}] recorded for goal "${goal.title}".` }] };
  }
);

server.registerTool(
  "create_goal",
  {
    description: "创建新目标",
    inputSchema: {
      title: z.string().describe("目标标题"),
      background: z.string().describe("为什么要做这个目标（背景/动机）"),
      parent_ids: z.array(z.string()).optional().describe("父目标 ID 列表（可选）"),
      dependencies: z.array(z.string()).optional().describe("依赖的目标 ID 列表（可选）"),
      cost: z.number().int().min(1).max(10).optional().describe("执行成本 1-10（默认 3）"),
      ddl: z.string().nullable().optional().describe("截止日期 YYYY-MM-DD（可选）"),
      success_criteria: z.string().optional().describe("成功标准（可选）"),
    },
  },
  async ({ title, background, parent_ids, dependencies, cost, ddl, success_criteria }) => {
    const goal = GoalUtils.create(title, background, {
      parentIds: parent_ids ?? [],
      dependencies: dependencies ?? [],
      cost: cost ?? 3,
      ddl: ddl ?? null,
      successCriteria: success_criteria ?? "",
    });
    goal.status = "ready";
    saveGoal(goal);
    return { content: [{ type: "text", text: `Goal created: [${goal.id}] "${goal.title}"` }] };
  }
);

server.registerTool(
  "update_goal",
  {
    description: "更新目标的字段（只传需要修改的字段）",
    inputSchema: {
      goalId: z.string().describe("目标 ID"),
      title: z.string().optional(),
      background: z.string().optional(),
      status: z.enum(["ready", "in_progress", "done"]).optional(),
      cost: z.number().int().min(1).max(10).optional(),
      ddl: z.string().nullable().optional().describe("截止日期 YYYY-MM-DD，传 null 清除"),
      success_criteria: z.string().optional(),
      note: z.string().optional().describe("追加一条备注"),
      clearNotes: z.boolean().optional().describe("清空所有备注"),
      addDependencies: z.array(z.string()).optional().describe("追加依赖目标 ID"),
      removeDependencies: z.array(z.string()).optional().describe("移除依赖目标 ID"),
      addParentIds: z.array(z.string()).optional().describe("追加父目标 ID"),
      removeParentIds: z.array(z.string()).optional().describe("移除父目标 ID"),
    },
  },
  async ({ goalId, title, background, status, cost, ddl, success_criteria, note, clearNotes, addDependencies, removeDependencies, addParentIds, removeParentIds }) => {
    const goal = getGoal(goalId);
    if (!goal) return { content: [{ type: "text", text: `Goal not found: ${goalId}` }] };
    if (title !== undefined) goal.title = title;
    if (background !== undefined) goal.background = background;
    if (status !== undefined) goal.status = status;
    if (cost !== undefined) goal.cost = cost;
    if (ddl !== undefined) goal.ddl = ddl;
    if (success_criteria !== undefined) goal.success_criteria = success_criteria;
    if (clearNotes) goal.notes = [];
    if (note) goal.notes.push(note);
    if (addDependencies?.length)
      goal.dependencies = [...new Set([...goal.dependencies, ...addDependencies])];
    if (removeDependencies?.length)
      goal.dependencies = goal.dependencies.filter(id => !removeDependencies.includes(id));
    if (addParentIds?.length)
      goal.parent_ids = [...new Set([...goal.parent_ids, ...addParentIds])];
    if (removeParentIds?.length)
      goal.parent_ids = goal.parent_ids.filter(id => !removeParentIds.includes(id));
    goal.updated_at = new Date().toISOString();
    saveGoal(goal);
    return { content: [{ type: "text", text: `Goal [${goalId}] updated.` }] };
  }
);

server.registerTool(
  "kb_search",
  {
    description: "在知识库中全文搜索（支持多词 AND 查询）",
    inputSchema: { query: z.string().describe("搜索关键词") },
  },
  async ({ query }) => {
    const results = search(query);
    if (!results.length) return { content: [{ type: "text", text: "No KB entries found." }] };
    return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
  }
);

server.registerTool(
  "kb_add",
  {
    description: "向知识库添加条目",
    inputSchema: {
      title: z.string().describe("条目标题"),
      body: z.string().describe("条目内容"),
      tags: z.array(z.string()).optional().describe("标签列表（可选）"),
    },
  },
  async ({ title, body, tags }) => {
    const entry = KBEntryUtils.create(title, body, tags ?? []);
    saveKbEntry(entry);
    return { content: [{ type: "text", text: `KB entry [${entry.id}] "${entry.title}" added.` }] };
  }
);

server.registerTool(
  "bind_session",
  {
    description: "将当前会话与指定目标绑定，后续上下文注入将专注该目标",
    inputSchema: {
      sessionKey: z.string().describe("会话标识（transcript 文件名，不含 .jsonl）"),
      goalId: z.string().describe("要绑定的目标 ID"),
    },
  },
  async ({ sessionKey, goalId }) => {
    if (goalId !== "NONE") {
      const goal = getGoal(goalId);
      if (!goal) return { content: [{ type: "text", text: `Goal not found: ${goalId}` }] };
      saveSession(sessionKey, goalId);
      return { content: [{ type: "text", text: `Session "${sessionKey}" bound to goal [${goalId}] "${goal.title}".` }] };
    }
    saveSession(sessionKey, "NONE");
    return { content: [{ type: "text", text: `Session "${sessionKey}" marked as temporary (no goal).` }] };
  }
);

server.registerTool(
  "get_session_goal",
  {
    description: "查询当前会话绑定的目标 ID",
    inputSchema: {
      sessionKey: z.string().describe("会话标识（transcript 文件名，不含 .jsonl）"),
    },
  },
  async ({ sessionKey }) => {
    const goalId = getSessionGoal(sessionKey);
    if (!goalId) return { content: [{ type: "text", text: `No goal bound to session "${sessionKey}".` }] };
    const goal = getGoal(goalId);
    const title = goal?.title ?? "(unknown)";
    return { content: [{ type: "text", text: `Session "${sessionKey}" is bound to goal [${goalId}] "${title}".` }] };
  }
);

server.registerResource(
  "goal_state",
  "goal-memory://state",
  { description: "当前目标状态快照：进行中、下一个推荐任务、可执行数量" },
  async () => {
    const goals = loadGoals();
    const allGoals = [...goals.values()];
    const next = pickNext();
    const inProgress = allGoals.filter(g => g.status === "in_progress");
    const ready = candidateGoals(goals);
    return {
      contents: [{
        uri: "goal-memory://state",
        mimeType: "application/json",
        text: JSON.stringify({
          next: next ? { id: next.goal.id, title: next.goal.title, score: next.explanation } : null,
          in_progress: inProgress.map(g => ({ id: g.id, title: g.title })),
          actionable_count: ready.length,
          total: allGoals.length,
        }, null, 2),
      }],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
