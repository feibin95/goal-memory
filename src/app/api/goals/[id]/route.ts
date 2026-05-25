import { z } from 'zod';
import { NextResponse } from 'next/server';
import { validateDdl } from '@/lib/core/models';
import { getGoal, saveGoal, deleteGoal, loadGoals, loadAttempts } from '@/lib/core/store';
import { GoalStatusSchema } from '@/types';

const updateGoalSchema = z.object({
  title:            z.string().min(1).optional(),
  background:       z.string().optional(),
  success_criteria: z.string().optional(),
  status:           GoalStatusSchema.optional(),
  cost:             z.number().int().optional(),
  ddl:              z.string().nullable().optional(),
  notes:            z.array(z.string()).optional(),
  parent_ids:       z.array(z.string()).optional(),
  dependencies:     z.array(z.string()).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  const goal = getGoal(id);
  if (!goal) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const parsed = updateGoalSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { title, background, success_criteria, status, cost, ddl, notes, parent_ids, dependencies } = parsed.data;
  if (title !== undefined) goal.title = title;
  if (background !== undefined) goal.background = background;
  if (success_criteria !== undefined) goal.success_criteria = success_criteria;
  if (status !== undefined) goal.status = status;
  if (cost !== undefined) goal.cost = cost;
  if (ddl !== undefined) goal.ddl = ddl;
  if (notes !== undefined) goal.notes = notes;
  if (parent_ids !== undefined) goal.parent_ids = parent_ids;
  if (dependencies !== undefined) goal.dependencies = dependencies;
  goal.updated_at = new Date().toISOString();

  const goals = loadGoals();
  goals.set(goal.id, goal);
  const err = validateDdl(goal, goals);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  saveGoal(goal);
  return NextResponse.json(goal);
}

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const goal = getGoal(id);
  if (!goal) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const attempts = loadAttempts().filter(a => a.goal_id === id);
  return NextResponse.json({ ...goal, attempts });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const deleted = deleteGoal(id);
  if (!deleted) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ deleted: id });
}
