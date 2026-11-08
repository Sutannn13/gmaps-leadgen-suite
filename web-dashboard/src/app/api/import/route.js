import { NextResponse } from 'next/server';
import { upsertScrapedLeadsToRepo } from '@/lib/leadsRepository';

export async function POST(request) {
  try {
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
