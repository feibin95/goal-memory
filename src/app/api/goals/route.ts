import { NextResponse } from 'next/server';
import { GoalUtils, validateDdl } from '@/lib/core/models';
import { saveGoal, loadGoals } from '@/lib/core/store';

export async function POST(req: Request) {
  const { title, background, parentIds, dependencies, cost, successCriteria, ddl } = await req.json() as Record<string, unknown>;
  if (!title || !background)
    return NextResponse.json({ error: 'title and background are required' }, { status: 400 });

  const goal = GoalUtils.create(String(title), String(background), {
    parentIds: Array.isArray(parentIds) ? (parentIds as string[]) : [],
    dependencies: Array.isArray(dependencies) ? (dependencies as string[]) : [],
    cost: cost ? Number(cost) : 3,
    successCriteria: successCriteria ? String(successCriteria) : '',
    ddl: ddl ? String(ddl) : null,
  });
  goal.status = 'ready';

  const goals = loadGoals();
  goals.set(goal.id, goal);
  const err = validateDdl(goal, goals);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  saveGoal(goal);
  return NextResponse.json(goal, { status: 201 });
}
