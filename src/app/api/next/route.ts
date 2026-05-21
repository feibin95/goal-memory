import { NextResponse } from 'next/server';
import { pickNext } from '@/lib/core/scheduler';

export function GET() {
  const result = pickNext();
  if (!result) return NextResponse.json({ goal: null });
  return NextResponse.json(result);
}
