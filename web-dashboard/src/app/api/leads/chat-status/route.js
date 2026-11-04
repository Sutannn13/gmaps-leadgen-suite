import { NextResponse } from 'next/server';
import { openDb } from '@/lib/db';

export async function POST(request) {
  try {
    const body = await request.json();
    const rawId = body?.id;
    const chatStatus = String(body?.chatStatus || 'BELUM').toUpperCase().trim();
    const contactedAt = body?.contactedAt ? String(body.contactedAt).trim() : null;

    if (rawId === undefined || rawId === null || String(rawId).trim() === '') {
      return NextResponse.json(
        { success: false, error: 'ID prospek wajib diisi.' },
        { status: 400 }
      );
    }

    if (chatStatus !== 'SUDAH' && chatStatus !== 'BELUM') {
      return NextResponse.json(
        { success: false, error: 'Status chat harus "SUDAH" atau "BELUM".' },
        { status: 400 }
      );
    }

    const id = String(rawId).trim();
    const sql = await openDb();

    if (/^\d+$/.test(id)) {
      await sql`
        UPDATE "Lead"
        SET 
          "chatStatus" = ${chatStatus},
          "contactedAt" = ${contactedAt}
        WHERE id = ${id}::bigint
      `;
    } else {
      await sql`
        UPDATE "Lead"
        SET 
          "chatStatus" = ${chatStatus},
          "contactedAt" = ${contactedAt}
        WHERE id::text = ${id}
      `;
    }

    return NextResponse.json({
      success: true,
      chatStatus,
      contactedAt,
    });
  } catch (err) {
    console.error('Update chat status failed:', { message: err?.message });
    return NextResponse.json(
      { success: false, error: 'Gagal memperbarui status chat di database.' },
      { status: 500 }
    );
  }
}

