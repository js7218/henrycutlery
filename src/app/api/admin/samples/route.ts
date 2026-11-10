import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminGuard';
import { listSampleRequests, updateSampleRequestStatus } from '@/lib/sampleRequests';

export const dynamic = 'force-dynamic';

export async function GET() {
  const adminResult = await requireAdmin();
  if ('response' in adminResult) return adminResult.response;

  const samples = await listSampleRequests(100);
  return NextResponse.json({ success: true, samples });
}

export async function PATCH(request: Request) {
  const adminResult = await requireAdmin();
  if ('response' in adminResult) return adminResult.response;

  const body = await request.json().catch(() => null);
  const id = typeof body?.id === 'string' ? body.id : '';
  const status = typeof body?.status === 'string' ? body.status : '';
  if (!id || !status) {
    return NextResponse.json({ success: false, error: 'id and status are required' }, { status: 400 });
  }

  const sample = await updateSampleRequestStatus(id, status);
  if (!sample) {
    return NextResponse.json({ success: false, error: 'Invalid status or request' }, { status: 400 });
  }
  return NextResponse.json({ success: true, sample });
}
