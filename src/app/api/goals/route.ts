import { NextResponse } from 'next/server';
import { z } from 'zod';
import { GoalUtils, validateDdl } from '@/lib/core/models';
import { saveGoal, loadGoals } from '@/lib/core/store';
import { filterGoals } from '@/lib/core/scheduler';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const parent_id = searchParams.get('parent_id') ?? undefined;
  const actionable = searchParams.get('actionable') === 'true' ? true : undefined;
  const goals = filterGoals({ parent_id, actionable });
  return NextResponse.json(goals);
}

const createGoalSchema = z.object({
  title:            z.string().min(1),
  background:       z.string().min(1),
  parent_ids:       z.array(z.string()).default([]),
  dependencies:     z.array(z.string()).default([]),
  cost:             z.number().int().default(3),
  success_criteria: z.string().default(''),
  ddl:              z.string().nullable().default(null),
});

export async function POST(req: Request) {
  const parsed = createGoalSchema.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { title, background, parent_ids, dependencies, cost, success_criteria, ddl } = parsed.data;
  const draft = GoalUtils.create(title, background, {
    parentIds: parent_ids,
    dependencies,
    cost,
    successCriteria: success_criteria,
    ddl,
  });

  const goals = loadGoals();
  const err = validateDdl(draft, goals);  // draft.id='' won't match any existing child
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  const goal = saveGoal(draft);
  return NextResponse.json(goal, { status: 201 });
}
