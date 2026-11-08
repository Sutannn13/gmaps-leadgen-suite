import { NextResponse } from 'next/server';
import { deleteLeadsFromRepo } from '@/lib/leadsRepository';

export async function POST() {
  try {
    await deleteLeadsFromRepo(null);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Delete all leads failed:', { message: err?.message });
    return NextResponse.json(
      { success: false, error: 'Gagal mengosongkan seluruh data prospek di database.' },
      { status: 500 }
    );
  }
}
