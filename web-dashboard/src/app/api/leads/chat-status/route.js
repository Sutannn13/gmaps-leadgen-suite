import { NextResponse } from 'next/server';
import { updateLeadChatStatusInRepo } from '@/lib/leadsRepository';

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

    await updateLeadChatStatusInRepo(rawId, chatStatus, contactedAt);
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

