import { NextResponse } from 'next/server';
import { deleteLeadsFromRepo } from '@/lib/leadsRepository';

export async function POST(request) {
  try {
    const body = await request.json();
    const rawId = body?.id;

    if (rawId === undefined || rawId === null || String(rawId).trim() === '') {
      return NextResponse.json(
        { success: false, error: 'ID prospek tidak valid.' },
        { status: 400 }
      );
    }

    await deleteLeadsFromRepo([String(rawId).trim()]);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Delete lead failed:', { message: err?.message });
    return NextResponse.json(
      { success: false, error: 'Gagal menghapus prospek dari database.' },
      { status: 500 }
    );
  }
}
