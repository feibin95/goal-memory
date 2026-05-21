import { NextResponse } from 'next/server';
import { AttemptUtils } from '@/lib/core/models';
import { getGoal, saveAttempt } from '@/lib/core/store';

export async function POST(req: Request) {
  const { goalId, hypothesis, action, result, gradient } = await req.json() as Record<string, unknown>;
  if (!goalId || !hypothesis || !action || !result)
    return NextResponse.json({ error: 'missing required fields' }, { status: 400 });

  const goal = getGoal(String(goalId));
  if (!goal) return NextResponse.json({ error: 'goal not found' }, { status: 404 });

  const gradientValue = gradient != null ? Number(gradient) : null;
  if (gradientValue != null && isNaN(gradientValue))
    return NextResponse.json({ error: 'gradient must be a number' }, { status: 400 });

  const attempt = AttemptUtils.create(
    String(goalId), String(hypothesis), String(action), String(result), gradientValue,
  );
  saveAttempt(attempt);
  return NextResponse.json(attempt, { status: 201 });
}
