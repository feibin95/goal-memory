import { z } from 'zod';
import { NextResponse } from 'next/server';
import { getAttemptById, updateAttempt, deleteAttempt } from '@/lib/core/store';

const updateAttemptSchema = z.object({
  hypothesis: z.string().min(1).optional(),
  action:     z.string().min(1).optional(),
  result:     z.string().min(1).optional(),
  gradient:   z.number().nullable().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  const attempt = getAttemptById(id);
  if (!attempt) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const parsed = updateAttemptSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  updateAttempt(id, parsed.data as Partial<Record<string, unknown>>);
  return NextResponse.json({ ...attempt, ...parsed.data });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const deleted = deleteAttempt(id);
  if (!deleted) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ deleted: id });
}
