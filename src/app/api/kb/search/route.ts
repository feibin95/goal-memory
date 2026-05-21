import { NextResponse } from 'next/server';
import { search } from '@/lib/core/kb';

export function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q') || '';
  if (!q) return NextResponse.json([]);
  return NextResponse.json(search(q));
}
