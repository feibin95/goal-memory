export type GoalStatus = 'ready' | 'in_progress' | 'done';


export interface Goal {
  id: string;
  title: string;
  background: string;
  parent_ids: string[];
  dependencies: string[];
  status: GoalStatus;
  cost: number;
  ddl: string | null;
  success_criteria: string;
  notes: string[];
  created_at: string;
  updated_at: string;
}

export interface Attempt {
  id: string;
  goal_id: string;
  hypothesis: string;
  action: string;
  result: string;
  gradient: number | null;
  created_at: string;
}

export interface KBEntry {
  id: string;
  title: string;
  body: string;
  tags: string[];
  created_at: string;
}

export interface AppState {
  goals: Record<string, Goal>;
  attempts: Attempt[];
  kb: KBEntry[];
  storagePath: string;
}
