import { NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';
import crypto from 'node:crypto';
import { upsertScrapedLeadsToRepo } from '@/lib/leadsRepository';

function safeCompareSecret(provided, configured) {
  if (typeof provided !== 'string' || typeof configured !== 'string') return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(configured);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function POST(request) {
  try {
    const cookieStore = await cookies();
    const isAuthenticated = cookieStore.has('auth');

    const headerStore = await headers();
    const configuredSecret =
      process.env.MUSE_BRIDGE_SECRET ||
      process.env.MUSE_WEBHOOK_SECRET ||
      'kodekiri_muse_secret_key';
    const providedSecret =
      headerStore.get('x-muse-secret') ||
      headerStore.get('authorization')?.replace(/^Bearer\s+/i, '');
    const isAgentAuthorized = Boolean(
      providedSecret && safeCompareSecret(providedSecret, configuredSecret)
    );

    if (!isAuthenticated && !isAgentAuthorized) {
      return NextResponse.json(
        { success: false, error: 'Autentikasi diperlukan untuk memasukkan data prospek.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const data = body.data || body.leads || [];
    const categoryName = body.categoryName || null;

    const { insertedCount, updatedCount, insertedLeads } = await upsertScrapedLeadsToRepo(
      Array.isArray(data) ? data : [],
      categoryName
    );

    return NextResponse.json({
      success: true,
      inserted: insertedCount,
      updated: updatedCount,
      total: insertedCount + updatedCount,
      leads: insertedLeads,
    });
  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
