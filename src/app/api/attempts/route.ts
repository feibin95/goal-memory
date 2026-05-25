import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getGoal, saveAttempt, loadAttempts, getAvailableAttempts } from '@/lib/core/store';
import { AttemptUtils } from '@/lib/core/models';
import { createAttemptFiles } from '@/lib/core/attempt-files';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const goalId = searchParams.get('goalId');
  if (!goalId) return NextResponse.json({ error: 'goalId required' }, { status: 400 });
  const available = searchParams.get('available') === 'true';
  const attempts = available
    ? getAvailableAttempts(goalId)
    : loadAttempts().filter(a => a.goal_id === goalId);
  return NextResponse.json(attempts);
}

const createAttemptSchema = z.object({
  goalId:     z.string().min(1),
  hypothesis: z.string().optional().default(''),
});

export async function POST(req: Request) {
  const parsed = createAttemptSchema.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { goalId, hypothesis } = parsed.data;
  const goal = getGoal(goalId);
  if (!goal) return NextResponse.json({ error: 'goal not found' }, { status: 404 });

  const id = crypto.randomUUID().slice(0, 8);
  const filesDir = createAttemptFiles(id, goal);
  const attempt = AttemptUtils.createActive(goalId, filesDir, hypothesis, id);
  saveAttempt(attempt);
  return NextResponse.json(attempt, { status: 201 });
}
