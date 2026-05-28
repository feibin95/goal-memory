import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Goal } from '@/types';

let BASE_DIR = path.join(os.homedir(), '.goal-memory');

export function setAttemptFilesBaseDir(dir: string): void {
  BASE_DIR = path.join(dir, '.goal-memory');
}

export function buildAttemptDirName(goalTitle: string, seq: number): string {
  const safeTitle = goalTitle.replace(/[/\\:*?"<>|]/g, '-');
  return `${safeTitle}-${seq}`;
}

export function getAttemptFilesDir(dirName: string): string {
  const _d = new Date(); const _p = (n: number) => String(n).padStart(2, '0');
  const yyyy = String(_d.getFullYear());
  const mm = _p(_d.getMonth() + 1);
  const dd = _p(_d.getDate());
  return path.join(BASE_DIR, 'attempts', yyyy, mm, dd, dirName);
}

export function createAttemptFiles(dirName: string, goal: Goal): string {
  const dir = getAttemptFilesDir(dirName);
  fs.mkdirSync(dir, { recursive: true });

  const taskPlan = [
    `# Task Plan: ${goal.title}`,
    '',
    `目标：${goal.success_criteria || goal.background}`,
    '',
    '记录目标分解、执行阶段划分、关键决策及遇到的错误。格式自由，按实际需要组织。',
  ].join('\n');

  const findings = [
    `# Findings: ${goal.title}`,
    '',
    '存放调研发现、技术方案选型、已知约束与问题。有新发现随时追加，不需要固定格式。',
  ].join('\n');

  const progress = [
    `# Progress: ${goal.title}`,
    '',
    '记录每次会话的进展、测试结果、错误日志。开始新会话时先读此文件恢复上下文。',
  ].join('\n');

  fs.writeFileSync(path.join(dir, 'task_plan.md'), taskPlan, 'utf-8');
  fs.writeFileSync(path.join(dir, 'findings.md'), findings, 'utf-8');
  fs.writeFileSync(path.join(dir, 'progress.md'), progress, 'utf-8');

  return dir;
}

export function readAttemptFiles(filesDir: string): { taskPlan: string; findings: string; progress: string } {
  const read = (name: string): string => {
    const p = path.join(filesDir, name);
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : '';
  };
  return {
    taskPlan: read('task_plan.md'),
    findings: read('findings.md'),
    progress: read('progress.md'),
  };
}

export function formatAttemptFilesForContext(attemptId: string, filesDir: string): string {
  if (!filesDir) return '';
  const desc: Record<string, string> = {
    'task_plan.md': '目标分解与决策记录',
    'findings.md': '调研发现与技术方案',
    'progress.md': '会话日志与进度跟踪',
  };
  const lines: string[] = [`## 执行规划文件（Attempt: ${attemptId}）`];
  for (const name of ['task_plan.md', 'findings.md', 'progress.md']) {
    lines.push(`- ${name}（${desc[name]}）: ${path.join(filesDir, name)}`);
  }
  lines.push('');
  lines.push('> 使用规范：开始工作前读 progress.md 恢复上下文；调研结论和技术决策写入 findings.md；阶段推进或决策变更时更新 task_plan.md。');
  return lines.join('\n');
}
