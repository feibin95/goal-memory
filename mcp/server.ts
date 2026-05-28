import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { setBaseDir, loadGoals, loadAttempts, getGoal, saveGoal, deleteGoal, saveAttempt, saveKbEntry, deleteKbEntry, getAttemptById, updateAttempt, deleteAttempt, getAvailableAttempts, nextAttemptSeq } from "../src/lib/core/store.js";
import { pickNext, candidateGoals, filterGoals } from "../src/lib/core/scheduler.js";
import { buildContextPack } from "../src/lib/core/context.js";
import { search } from "../src/lib/core/kb.js";
import { GoalUtils, AttemptUtils, KBEntryUtils } from "../src/lib/core/models.js";
import { saveSession, getSessionGoal, getSession, setSessionBaseDir, bindAttempt } from "../src/lib/core/session-store.js";
import { setAttemptFilesBaseDir, createAttemptFiles, formatAttemptFilesForContext, buildAttemptDirName } from "../src/lib/core/attempt-files.js";
import { ATTEMPT_FIELD_GUIDANCE, ATTEMPT_FIELD_LIMITS, GOAL_FIELD_GUIDANCE, GOAL_FIELD_LIMITS, maxLengthMessage } from "../src/lib/core/field-policy.js";
import os from "node:os";

setBaseDir(os.homedir());
setSessionBaseDir(os.homedir());
setAttemptFilesBaseDir(os.homedir());

const server = new McpServer({ name: "goal-memory", version: "1.0.0" });

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
  {
    description: "列出目标列表。支持按父节点过滤（parent_id）、只列可执行目标（actionable=true，结果按 score 降序）、以及关键词搜索（keyword，匹配 title/background）。",
    inputSchema: {
      parent_id: z.string().optional().describe("仅列出该父节点的直接子目标（可选）"),
      actionable: z.boolean().optional().describe("仅列出可执行目标（status=ready，叶节点，依赖已完成），按评分降序（可选）"),
      keyword: z.string().optional().describe("关键词过滤，匹配 title 或 background（可选）"),
    },
  },
  async ({ parent_id, actionable, keyword }) => {
    const goals = filterGoals({ parent_id, actionable, keyword });
    if (!goals.length) return { content: [{ type: "text", text: "No goals found." }] };
    return { content: [{ type: "text", text: JSON.stringify(goals, null, 2) }] };
  }
);


server.registerTool(
  "delete_goal",
  {
    description: "删除目标（级联删除孤立子节点，解除多父节点的父子关系）",
    inputSchema: { goal_id: z.string().describe("要删除的目标 ID") },
  },
  async ({ goal_id }) => {
    const deleted = deleteGoal(goal_id);
    if (!deleted) return { content: [{ type: "text", text: `Goal not found: ${goal_id}` }] };
    return { content: [{ type: "text", text: `Goal [${goal_id}] deleted.` }] };
  }
);

server.registerTool(
  "create_attempt",
  {
    description: "为当前会话创建一个执行 Attempt，自动生成 task_plan.md / findings.md / progress.md 三个规划文件，并将 session 绑定到此 Attempt。若传入 existingAttemptId 则直接绑定已有 Attempt，不新建文件。",
    inputSchema: {
      goalId: z.string().describe("目标 ID"),
      sessionKey: z.string().describe("会话标识（transcript 文件名，不含 .jsonl）"),
      hypothesis: z.string().max(ATTEMPT_FIELD_LIMITS.hypothesis, maxLengthMessage("假设", ATTEMPT_FIELD_LIMITS.hypothesis)).optional().describe(`本次执行的初始假设（可选）。${ATTEMPT_FIELD_GUIDANCE.hypothesis}`),
      existingAttemptId: z.string().optional().describe("若要恢复已有 Attempt，传入其 ID（可选）"),
    },
  },
  async ({ goalId, sessionKey, hypothesis, existingAttemptId }) => {
    const goal = getGoal(goalId);
    if (!goal) return { content: [{ type: "text", text: `Goal not found: ${goalId}` }] };

    if (existingAttemptId) {
      const existing = getAttemptById(existingAttemptId);
      if (!existing) return { content: [{ type: "text", text: `Attempt not found: ${existingAttemptId}` }] };
      if (!getSession(sessionKey)) saveSession(sessionKey, goal.id);
      bindAttempt(sessionKey, existingAttemptId);
      if (goal.status === "ready") { goal.status = "in_progress"; goal.updated_at = new Date().toISOString(); saveGoal(goal); }
      return {
        content: [{
          type: "text",
          text: `Session "${sessionKey}" resumed Attempt [${existingAttemptId}].\nFiles dir: ${existing.files_dir}`,
        }],
      };
    }

    const seq = nextAttemptSeq(goal.id);
    const dirName = buildAttemptDirName(goal.title, seq);
    const filesDir = createAttemptFiles(dirName, goal);
    const attempt = saveAttempt(AttemptUtils.createActive(goal.id, filesDir, hypothesis ?? ""));
    if (goal.status === "ready") { goal.status = "in_progress"; goal.updated_at = new Date().toISOString(); saveGoal(goal); }
    if (!getSession(sessionKey)) saveSession(sessionKey, goal.id);
    bindAttempt(sessionKey, attempt.id);
    return {
      content: [{
        type: "text",
        text: `Attempt [${attempt.id}] created for goal "${goal.title}".\nPlanning files at: ${filesDir}\nSession "${sessionKey}" bound to this attempt.`,
      }],
    };
  }
);

server.registerTool(
  "update_attempt",
  {
    description: "更新 Attempt 字段。将 status 设为 completed 并填写 action/result 即可完成一个 Attempt。",
    inputSchema: {
      attemptId: z.string().describe("Attempt ID"),
      status: z.enum(["active", "completed"]).optional().describe("新状态（设为 completed 即完成）"),
      action: z.string().max(ATTEMPT_FIELD_LIMITS.action, maxLengthMessage("行动", ATTEMPT_FIELD_LIMITS.action)).optional().describe(`实际执行了什么。${ATTEMPT_FIELD_GUIDANCE.action}`),
      result: z.string().max(ATTEMPT_FIELD_LIMITS.result, maxLengthMessage("结果", ATTEMPT_FIELD_LIMITS.result)).optional().describe(`观察到的结果。${ATTEMPT_FIELD_GUIDANCE.result}`),
      gradient: z.number().nullable().optional().describe("进展评分（-1 到 +1，可选）"),
    },
  },
  async ({ attemptId, status, action, result, gradient }) => {
    const patch: Record<string, unknown> = {};
    if (status !== undefined) patch.status = status;
    if (action !== undefined) patch.action = action;
    if (result !== undefined) patch.result = result;
    if (gradient !== undefined) patch.gradient = gradient;
    const ok = updateAttempt(attemptId, patch);
    if (!ok) return { content: [{ type: "text", text: `Attempt not found: ${attemptId}` }] };
    return { content: [{ type: "text", text: `Attempt [${attemptId}] updated.` }] };
  }
);

server.registerTool(
  "list_attempts",
  {
    description: "列出某目标下的 Attempt 列表。available=true 时只返回活跃且未被任何 session 持有的 Attempt（可续接）。",
    inputSchema: {
      goalId: z.string().describe("目标 ID"),
      available: z.boolean().optional().describe("仅返回可续接的 Attempt（active 且无 session 持有）"),
    },
  },
  async ({ goalId, available }) => {
    const attempts = available
      ? getAvailableAttempts(goalId)
      : loadAttempts().filter(a => a.goal_id === goalId);
    if (!attempts.length) return { content: [{ type: "text", text: "No attempts found." }] };
    return { content: [{ type: "text", text: JSON.stringify(attempts, null, 2) }] };
  }
);

server.registerTool(
  "get_attempt",
  {
    description: "获取 Attempt 详情。include_files=true 时附带三个规划文件内容（task_plan.md / findings.md / progress.md）。",
    inputSchema: {
      attemptId: z.string().describe("Attempt ID"),
      include_files: z.boolean().optional().describe("是否附带规划文件内容"),
    },
  },
  async ({ attemptId, include_files }) => {
    const attempt = getAttemptById(attemptId);
    if (!attempt) return { content: [{ type: "text", text: `Attempt not found: ${attemptId}` }] };
    if (include_files) {
      const files = formatAttemptFilesForContext(attemptId, attempt.files_dir);
      return { content: [{ type: "text", text: JSON.stringify({ ...attempt, files: files ?? null }, null, 2) }] };
    }
    return { content: [{ type: "text", text: JSON.stringify(attempt, null, 2) }] };
  }
);

server.registerTool(
  "delete_attempt",
  {
    description: "删除一个 Attempt",
    inputSchema: { attemptId: z.string().describe("Attempt ID") },
  },
  async ({ attemptId }) => {
    const ok = deleteAttempt(attemptId);
    if (!ok) return { content: [{ type: "text", text: `Attempt not found: ${attemptId}` }] };
    return { content: [{ type: "text", text: `Attempt [${attemptId}] deleted.` }] };
  }
);

server.registerTool(
  "create_goal",
  {
    description: "创建新目标",
    inputSchema: {
      title: z.string().max(GOAL_FIELD_LIMITS.title, maxLengthMessage("目标标题", GOAL_FIELD_LIMITS.title)).describe(GOAL_FIELD_GUIDANCE.title),
      background: z.string().max(GOAL_FIELD_LIMITS.background, maxLengthMessage("背景问题", GOAL_FIELD_LIMITS.background)).describe(`背景问题。${GOAL_FIELD_GUIDANCE.background}`),
      parent_ids: z.array(z.string()).optional().describe("父目标 ID 列表（可选）"),
      dependencies: z.array(z.string()).optional().describe("本目标的阻塞项（blocked by）：执行前必须完成的目标 ID 列表（可选）"),
      cost: z.number().int().min(1).max(10).optional().describe("执行成本 1-10（默认 3）"),
      ddl: z.string().nullable().optional().describe("截止日期 YYYY-MM-DD（可选）"),
      success_criteria: z.string().max(GOAL_FIELD_LIMITS.successCriteria, maxLengthMessage("成功标准", GOAL_FIELD_LIMITS.successCriteria)).optional().describe(`成功标准（可选）。${GOAL_FIELD_GUIDANCE.successCriteria}`),
    },
  },
  async ({ title, background, parent_ids, dependencies, cost, ddl, success_criteria }) => {
    const draft = GoalUtils.create(title, background, {
      parentIds: parent_ids ?? [],
      dependencies: dependencies ?? [],
      cost: cost ?? 3,
      ddl: ddl ?? null,
      successCriteria: success_criteria ?? "",
    });
    draft.status = "ready";
    const goal = saveGoal(draft);
    return { content: [{ type: "text", text: `Goal created: [${goal.id}] "${goal.title}"` }] };
  }
);

server.registerTool(
  "update_goal",
  {
    description: "更新目标的字段（只传需要修改的字段）",
    inputSchema: {
      goalId: z.string().describe("目标 ID"),
      title: z.string().max(GOAL_FIELD_LIMITS.title, maxLengthMessage("目标标题", GOAL_FIELD_LIMITS.title)).optional().describe(GOAL_FIELD_GUIDANCE.title),
      background: z.string().max(GOAL_FIELD_LIMITS.background, maxLengthMessage("背景问题", GOAL_FIELD_LIMITS.background)).optional().describe(`背景问题。${GOAL_FIELD_GUIDANCE.background}`),
      status: z.enum(["ready", "in_progress", "done"]).optional(),
      cost: z.number().int().min(1).max(10).optional(),
      ddl: z.string().nullable().optional().describe("截止日期 YYYY-MM-DD，传 null 清除"),
      success_criteria: z.string().max(GOAL_FIELD_LIMITS.successCriteria, maxLengthMessage("成功标准", GOAL_FIELD_LIMITS.successCriteria)).optional().describe(`成功标准。${GOAL_FIELD_GUIDANCE.successCriteria}`),
      note: z.string().max(GOAL_FIELD_LIMITS.note, maxLengthMessage("备注", GOAL_FIELD_LIMITS.note)).optional().describe(`追加一条备注。${GOAL_FIELD_GUIDANCE.note}`),
      clearNotes: z.boolean().optional().describe("清空所有备注"),
      addBlockedBy: z.array(z.string()).optional().describe("追加阻塞项：本目标执行前必须完成的目标 ID 列表"),
      removeBlockedBy: z.array(z.string()).optional().describe("移除阻塞项：解除对指定目标 ID 的依赖"),
      addParentIds: z.array(z.string()).optional().describe("追加父目标 ID"),
      removeParentIds: z.array(z.string()).optional().describe("移除父目标 ID"),
    },
  },
  async ({ goalId, title, background, status, cost, ddl, success_criteria, note, clearNotes, addBlockedBy, removeBlockedBy, addParentIds, removeParentIds }) => {
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
    if (addBlockedBy?.length)
      goal.dependencies = [...new Set([...goal.dependencies, ...addBlockedBy])];
    if (removeBlockedBy?.length)
      goal.dependencies = goal.dependencies.filter(id => !removeBlockedBy.includes(id));
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
    const entry = saveKbEntry(KBEntryUtils.create(title, body, tags ?? []));
    return { content: [{ type: "text", text: `KB entry [${entry.id}] "${entry.title}" added.` }] };
  }
);

server.registerTool(
  "kb_delete",
  {
    description: "删除知识库条目",
    inputSchema: { id: z.string().describe("条目 ID") },
  },
  async ({ id }) => {
    const ok = deleteKbEntry(id);
    if (!ok) return { content: [{ type: "text", text: `KB entry [${id}] not found.` }] };
    return { content: [{ type: "text", text: `KB entry [${id}] deleted.` }] };
  }
);

server.registerTool(
  "bind_session",
  {
    description: "将当前会话与目标绑定。可同时传 attempt_id 绑定到具体 Attempt。",
    inputSchema: {
      sessionKey: z.string().describe("会话标识（transcript 文件名，不含 .jsonl）"),
      goalId: z.string().describe("要绑定的目标 ID，传 NONE 表示临时会话"),
      attempt_id: z.string().optional().describe("同时绑定到指定 Attempt（可选）"),
    },
  },
  async ({ sessionKey, goalId, attempt_id }) => {
    if (goalId !== "NONE") {
      const goal = getGoal(goalId);
      if (!goal) return { content: [{ type: "text", text: `Goal not found: ${goalId}` }] };
      saveSession(sessionKey, goalId);
      if (attempt_id) {
        const attempt = getAttemptById(attempt_id);
        if (!attempt) return { content: [{ type: "text", text: `Attempt not found: ${attempt_id}` }] };
        bindAttempt(sessionKey, attempt_id);
        return { content: [{ type: "text", text: `Session "${sessionKey}" bound to goal [${goalId}] "${goal.title}" and attempt [${attempt_id}].` }] };
      }
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
    const s = getSession(sessionKey);
    if (!s?.goal_id) return { content: [{ type: "text", text: `No goal bound to session "${sessionKey}".` }] };
    const goal = getGoal(s.goal_id);
    const title = goal?.title ?? "(unknown)";
    const attemptInfo = s.attempt_id ? ` | Attempt: [${s.attempt_id}]` : " | No active attempt";
    return { content: [{ type: "text", text: `Session "${sessionKey}" → goal [${s.goal_id}] "${title}"${attemptInfo}` }] };
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
