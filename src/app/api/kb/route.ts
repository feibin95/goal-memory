import { NextResponse } from 'next/server';
import { addEntry } from '@/lib/core/kb';

export async function POST(req: Request) {
  const { title, body, tags } = await req.json() as { title?: string; body?: string; tags?: string[] };
  if (!title || !body)
    return NextResponse.json({ error: 'title and body are required' }, { status: 400 });
  const entry = addEntry(title, body, tags || []);
  return NextResponse.json(entry, { status: 201 });
}
