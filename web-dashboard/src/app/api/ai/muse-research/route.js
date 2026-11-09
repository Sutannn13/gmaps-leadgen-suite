import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  DEFAULT_AI_SETTINGS,
  DEFAULT_MUSE_MODEL,
  buildGroundedMuseResearch,
} from '@/lib/openrouter';

function getResearchQueuePath() {
  const repoRoot = path.resolve(process.cwd(), '..');
  return path.join(repoRoot, '.agents', 'muse-research-queue.json');
}

export async function POST(request) {
  try {
    const body = await request.json();
    const lead = body?.lead;
    const settings = { ...DEFAULT_AI_SETTINGS, ...(body?.settings || {}) };

    if (!lead || typeof lead !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Data prospek wajib dikirim.' },
        { status: 400 }
      );
    }

    const aiResearch = buildGroundedMuseResearch(lead, settings);
    const queuePath = getResearchQueuePath();
    let existing = { history: [] };
    try {
      const raw = await fs.readFile(queuePath, 'utf8');
      existing = JSON.parse(raw) || { history: [] };
    } catch {
      existing = { history: [] };
    }

    const entry = {
      leadId: String(lead.id || ''),
      leadName: String(lead.name || ''),
      address: String(lead.address || ''),
      aiResearch,
      researchedAt: new Date().toISOString(),
    };

    const nextPayload = {
      latest: entry,
      history: [entry, ...(Array.isArray(existing.history) ? existing.history : [])].slice(0, 50),
    };

    try {
      await fs.mkdir(path.dirname(queuePath), { recursive: true });
      await fs.writeFile(queuePath, JSON.stringify(nextPayload, null, 2), 'utf8');
    } catch (err) {
      if (err.code === 'EROFS' || err.code === 'EACCES') {
        try {
          await fs.writeFile(path.join('/tmp', 'muse-research-queue.json'), JSON.stringify(nextPayload, null, 2), 'utf8');
        } catch {}
      }
    }

    return NextResponse.json({
      success: true,
      model: DEFAULT_MUSE_MODEL,
      aiResearch,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err?.message || 'Gagal menjalankan riset prospek via Muse.ai.',
      },
      { status: 500 }
    );
  }
}
