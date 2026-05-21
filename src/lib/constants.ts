import type { GoalStatus } from '@/types';

export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  ready: '就绪',
  in_progress: '进行中',
  done: '已完成',
};
