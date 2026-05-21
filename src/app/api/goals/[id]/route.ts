import { NextResponse } from 'next/server';
import { validateDdl } from '@/lib/core/models';
import { getGoal, saveGoal, deleteGoal, loadGoals } from '@/lib/core/store';
import type { GoalStatus } from '@/types';

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  const goal = getGoal(id);
  if (!goal) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const { title, background, success_criteria, status, cost, ddl, notes } = await req.json() as Record<string, unknown>;
  if (title !== undefined) goal.title = String(title);
  if (background !== undefined) goal.background = String(background);
  if (success_criteria !== undefined) goal.success_criteria = String(success_criteria);
  if (status !== undefined) goal.status = status as GoalStatus;
  if (cost !== undefined) goal.cost = Number(cost);
  if (ddl !== undefined) goal.ddl = (ddl as string) || null;
  if (notes !== undefined) goal.notes = notes as string[];
  goal.updated_at = new Date().toISOString();

  const goals = loadGoals();
  goals.set(goal.id, goal);
  const err = validateDdl(goal, goals);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  saveGoal(goal);
  return NextResponse.json(goal);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const deleted = deleteGoal(id);
  if (!deleted) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ deleted: id });
}
