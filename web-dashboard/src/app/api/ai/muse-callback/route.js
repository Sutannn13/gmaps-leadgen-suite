import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';

function getResultsPath() {
  const repoRoot = path.resolve(process.cwd(), '..');
  return path.join(repoRoot, '.agents', 'muse-results.json');
}

export async function GET() {
  return NextResponse.json({
    success: true,
    endpoint: '/api/ai/muse-callback',
    status: 'ready',
  });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const jobId = String(body?.jobId || '').trim();
    const leadId = String(body?.leadId || 'default').trim();
    const leadName = String(body?.leadName || '').trim();
    const shareUrl = String(body?.shareUrl || body?.url || '').trim();
    const status = String(body?.status || (shareUrl ? 'completed' : 'running')).trim();
    const message = String(
      body?.message ||
        (shareUrl
          ? 'Mockup berhasil dibuat dan lolos Cross-Check Anti-Dummy 5 Poin.'
          : 'Muse.ai sedang memproses mockup...')
    ).trim();

    const resultsPath = getResultsPath();
    await fs.mkdir(path.dirname(resultsPath), { recursive: true });

    let existing = {};
    try {
      const raw = await fs.readFile(resultsPath, 'utf8');
      existing = JSON.parse(raw) || {};
    } catch {
      existing = {};
    }

    const record = {
      jobId: jobId || existing.latest?.jobId || `job_${Date.now()}`,
      leadId: leadId || existing.latest?.leadId || 'default',
      leadName: leadName || existing.latest?.leadName || 'Prospek',
      status,
      shareUrl,
      message,
      updatedAt: new Date().toISOString(),
    };

    const nextResults = {
      ...existing,
      latest: record,
      byLeadId: {
        ...(existing.byLeadId || {}),
        [record.leadId]: record,
      },
    };

    await fs.writeFile(resultsPath, JSON.stringify(nextResults, null, 2), 'utf8');

    return NextResponse.json({
      success: true,
      result: record,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Gagal memproses callback Muse.ai.' },
      { status: 500 }
    );
  }
}
