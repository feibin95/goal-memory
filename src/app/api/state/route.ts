import { NextResponse } from 'next/server';
import { loadGoals } from '@/lib/core/store';

export function GET() {
  const goals = Object.fromEntries(
    Array.from(loadGoals().entries()).map(([id, g]) => [id, {
      id: g.id, title: g.title, status: g.status,
      parent_ids: g.parent_ids, dependencies: g.dependencies, created_at: g.created_at,
    }])
  );
  return NextResponse.json({ goals });
}
