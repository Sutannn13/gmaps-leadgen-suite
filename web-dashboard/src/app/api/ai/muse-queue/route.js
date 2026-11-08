import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';

export const MUSE_KODEKIRI_THREAD_URL =
  'https://muse.ai/thread/0fb186d1-47d7-4af0-afa1-b09711b81ecc';

function getAgentsPaths() {
  const repoRoot = path.resolve(process.cwd(), '..');
  const agentsDir = path.join(repoRoot, '.agents');
  return {
    agentsDir,
    briefPath: path.join(agentsDir, 'muse-brief-latest.md'),
    resultsPath: path.join(agentsDir, 'muse-results.json'),
  };
}

async function readResultsMap(resultsPath) {
  try {
    const raw = await fs.readFile(resultsPath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const leadId = String(searchParams.get('leadId') || '').trim();
    const { resultsPath } = getAgentsPaths();
    const results = await readResultsMap(resultsPath);

    const entry = leadId
      ? results.byLeadId?.[leadId] ||
        (String(results.latest?.leadId || '') === leadId ? results.latest : null)
      : results.latest || null;

    return NextResponse.json({
      success: true,
      result: entry,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Gagal membaca status hasil Muse.ai.' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const prompt = String(body?.prompt || '').trim();
    const leadId = String(body?.leadId || 'default').trim();
    const leadName = String(body?.leadName || 'Prospek').trim();

    if (!prompt) {
      return NextResponse.json(
        { success: false, error: 'Prompt mockup kosong.' },
        { status: 400 }
      );
    }

    const { agentsDir, briefPath, resultsPath } = getAgentsPaths();
    await fs.mkdir(agentsDir, { recursive: true });

    const jobId = `job_${Date.now()}`;
    const createdAt = new Date().toISOString();

    const briefContent = `# Brief Mockup Terbaru — ${leadName}
Job ID: ${jobId}
Lead ID: ${leadId}
Lead Name: ${leadName}
Created At: ${createdAt}
Output Target File: D:\\DATA SUTAN ARLIE JOHAN\\Code Johan\\mapscrapping\\.agents\\muse-results.json

${prompt}
`;
    await fs.writeFile(briefPath, briefContent, 'utf8');

    const existingResults = await readResultsMap(resultsPath);
    const pendingRecord = {
      jobId,
      leadId,
      leadName,
      status: 'pending',
      shareUrl: '',
      message: 'Brief diterima di antrean, menunggu hook VM Muse.ai membangun mockup...',
      updatedAt: createdAt,
    };

    const nextResults = {
      ...existingResults,
      latest: pendingRecord,
      byLeadId: {
        ...(existingResults.byLeadId || {}),
        [leadId]: pendingRecord,
      },
    };
    await fs.writeFile(resultsPath, JSON.stringify(nextResults, null, 2), 'utf8');

    return NextResponse.json({
      success: true,
      jobId,
      leadId,
      status: 'pending',
      briefPath,
      resultsPath,
      threadUrl: MUSE_KODEKIRI_THREAD_URL,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err?.message || 'Gagal menulis file brief untuk VM Muse.ai.',
      },
      { status: 500 }
    );
  }
}
