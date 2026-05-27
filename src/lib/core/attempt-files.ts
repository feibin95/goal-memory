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

  const _now = new Date(); const _pp = (n: number) => String(n).padStart(2, '0');
  const today = `${_now.getFullYear()}-${_pp(_now.getMonth()+1)}-${_pp(_now.getDate())}`;

  const taskPlan = [
    `# Task Plan: ${goal.title}`,
    '',
    '## Goal',
    goal.success_criteria || goal.background,
    '',
    '## Current Phase',
    'Phase 1 - 分析与规划',
    '',
    '## Phases',
    '- [ ] Phase 1: 分析与规划',
    '- [ ] Phase 2: 实现',
    '- [ ] Phase 3: 验证与收尾',
    '',
    '## Key Questions',
    '<!-- 执行过程中需要回答的关键问题 -->',
    '',
    '## Decisions Made',
    '<!-- 技术/设计决策，格式: 决策 — 理由 -->',
    '',
    '## Errors Encountered',
    '<!-- 格式: [尝试#N] 错误描述 — 解决方案 -->',
  ].join('\n');

  const findings = [
    `# Findings: ${goal.title}`,
    '',
    '## Requirements',
    goal.success_criteria || '（待补充）',
    '',
    '## Background',
    goal.background || '（待补充）',
    '',
    '## Research Findings',
    '<!-- 调研发现、关键信息 -->',
    '',
    '## Technical Decisions',
    '<!-- 架构/技术选型决策及理由 -->',
    '',
    '## Issues Encountered',
    '<!-- 遇到的问题和解决方案 -->',
    '',
    '## Resources',
    '<!-- 有用的链接、文件路径、API 参考 -->',
  ].join('\n');

  const progress = [
    `# Progress: ${goal.title}`,
    '',
    '## Session Log',
    `### Session 1 — ${today}`,
    '- **Status**: Started',
    '- **Actions**: ',
    '- **Files Modified**: ',
    '',
    '## Test Results',
    '| Input | Expected | Actual | Status |',
    '|-------|----------|--------|--------|',
    '',
    '## Error Log',
    '| # | Timestamp | Error | Resolution |',
    '|---|-----------|-------|------------|',
    '',
    '## Reboot Check (5 Questions)',
    '1. **Where am I?** Current phase: Phase 1',
    '2. **Where am I going?** Next: Phase 2',
    `3. **What\'s the goal?** ${goal.title}`,
    '4. **What have I learned?** See findings.md',
    '5. **What have I done?** This session log',
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
  const { taskPlan, findings, progress } = readAttemptFiles(filesDir);
  const lines: string[] = [`## 执行规划文件（Attempt: ${attemptId}）`, ''];
  if (taskPlan) { lines.push('### task_plan.md', '', taskPlan, ''); }
  if (findings) { lines.push('### findings.md', '', findings, ''); }
  if (progress) { lines.push('### progress.md', '', progress, ''); }
  return lines.join('\n');
}
