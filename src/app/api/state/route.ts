import { NextResponse } from 'next/server';
import { loadGoals, loadAttempts, loadKb } from '@/lib/core/store';
import path from 'path';

export function GET() {
  const goals = Object.fromEntries(loadGoals());
  const attempts = loadAttempts();
  const kb = loadKb();
  const storagePath = path.join(process.cwd(), '.goal-memory');
  return NextResponse.json({ goals, attempts, kb, storagePath });
}
