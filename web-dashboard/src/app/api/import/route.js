import { NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';
import { upsertScrapedLeadsToRepo } from '@/lib/leadsRepository';

function safeCompareSecret(provided, configured) {
  if (typeof provided !== 'string' || typeof configured !== 'string') return false;
  let mismatch = provided.length === configured.length ? 0 : 1;
  const len = Math.max(provided.length, configured.length);
  for (let i = 0; i < len; i++) {
    const a = provided.charCodeAt(i % (provided.length || 1)) || 0;
    const b = configured.charCodeAt(i % (configured.length || 1)) || 0;
    mismatch |= a ^ b;
  }
  return mismatch === 0;
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
