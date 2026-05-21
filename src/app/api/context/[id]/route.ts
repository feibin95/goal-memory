import { NextResponse } from 'next/server';
import { buildContextPack } from '@/lib/core/context';

export function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return params.then(({ id }) => {
    const pack = buildContextPack(id);
    if (!pack) return NextResponse.json({ error: 'goal not found' }, { status: 404 });
    return NextResponse.json({ markdown: pack });
  });
}
