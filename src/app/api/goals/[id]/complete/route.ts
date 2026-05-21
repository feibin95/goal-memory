import { NextResponse } from 'next/server';
import { getGoal, saveGoal } from '@/lib/core/store';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const goal = getGoal(id);
  if (!goal) return NextResponse.json({ error: 'not found' }, { status: 404 });
  goal.status = 'done';
  goal.updated_at = new Date().toISOString();
  saveGoal(goal);
  return NextResponse.json(goal);
}
