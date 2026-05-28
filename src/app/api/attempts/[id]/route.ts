import { z } from 'zod';
import { NextResponse } from 'next/server';
import { getAttemptById, updateAttempt, deleteAttempt } from '@/lib/core/store';
import { formatAttemptFilesForContext } from '@/lib/core/attempt-files';
import { ATTEMPT_FIELD_LIMITS, maxLengthMessage } from '@/lib/core/field-policy';

const updateAttemptSchema = z.object({
  status:     z.enum(['active', 'completed']).optional(),
  hypothesis: z.string().min(1).max(ATTEMPT_FIELD_LIMITS.hypothesis, maxLengthMessage('假设', ATTEMPT_FIELD_LIMITS.hypothesis)).optional(),
  action:     z.string().min(1).max(ATTEMPT_FIELD_LIMITS.action, maxLengthMessage('行动', ATTEMPT_FIELD_LIMITS.action)).optional(),
  result:     z.string().min(1).max(ATTEMPT_FIELD_LIMITS.result, maxLengthMessage('结果', ATTEMPT_FIELD_LIMITS.result)).optional(),
  gradient:   z.number().nullable().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const attempt = getAttemptById(id);
  if (!attempt) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (searchParams.get('includeFiles') === 'true') {
    const files = formatAttemptFilesForContext(id, attempt.files_dir);
    return NextResponse.json({ ...attempt, files: files ?? null });
  }
  return NextResponse.json(attempt);
}

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
