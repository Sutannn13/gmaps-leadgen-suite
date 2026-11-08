import { NextResponse } from 'next/server';
import { deleteLeadsFromRepo } from '@/lib/leadsRepository';

const MAX_BATCH_SIZE = 500;

export async function POST(request) {
  try {
    const body = await request.json();
    const rawIds = Array.isArray(body?.ids) ? body.ids : [];

    const cleanIds = Array.from(
      new Set(
        rawIds
          .map((item) => (item === undefined || item === null ? '' : String(item).trim()))
          .filter(Boolean)
      )
    );

    if (cleanIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Daftar ID prospek yang akan dihapus tidak boleh kosong.' },
        { status: 400 }
      );
    }

    if (cleanIds.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: `Maksimal ${MAX_BATCH_SIZE} prospek per penghapusan batch.`,
        },
        { status: 400 }
      );
    }

    const deletedCount = await deleteLeadsFromRepo(cleanIds);
    return NextResponse.json({
      success: true,
      deletedCount,
    });
  } catch (err) {
    console.error('Batch delete failed:', { message: err?.message });
    return NextResponse.json(
      { success: false, error: 'Gagal menghapus daftar prospek dari database.' },
      { status: 500 }
    );
  }
}
