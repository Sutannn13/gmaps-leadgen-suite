import { NextResponse } from 'next/server';
import { updateLeadAiResearchInRepo } from '@/lib/leadsRepository';

const VALID_QUALIFICATIONS = new Set(['HOT LEAD', 'WARM LEAD', 'COLD LEAD']);

function sanitizeAiPayload(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const qualRaw = String(raw.leadQualification || 'WARM LEAD').toUpperCase().trim();
  const leadQualification = VALID_QUALIFICATIONS.has(qualRaw)
    ? qualRaw
    : qualRaw.includes('HOT')
      ? 'HOT LEAD'
      : qualRaw.includes('COLD')
        ? 'COLD LEAD'
        : 'WARM LEAD';

  const scoreNum = Number(raw.leadScore);
  const leadScore = Number.isFinite(scoreNum)
    ? Math.max(0, Math.min(100, Math.round(scoreNum)))
    : null;

  const trimText = (val, max = 2000) =>
    typeof val === 'string' ? val.trim().slice(0, max) : '';

  return {
    leadQualification,
    leadScore,
    opportunityType: trimText(raw.opportunityType, 160),
    digitalPresenceSummary: trimText(raw.digitalPresenceSummary, 1000),
    pitchAngle: trimText(raw.pitchAngle, 600),
    pitchDraft: trimText(raw.pitchDraft, 2000),
    qualificationReplyDraft: trimText(raw.qualificationReplyDraft, 2000),
    followUpDraft: trimText(raw.followUpDraft, 1500),
    museClientNotes: trimText(raw.museClientNotes, 1500),
    museReferenceUrl: trimText(raw.museReferenceUrl, 600),
    museShareUrl: trimText(raw.museShareUrl, 800),
    pipelineStage: trimText(raw.pipelineStage, 64),
    botPaused: Boolean(raw.botPaused),
    modelUsed: trimText(raw.modelUsed, 160),
    analyzedAt: trimText(raw.analyzedAt, 64) || new Date().toISOString(),
  };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const rawId = body?.id;
    const sanitized = sanitizeAiPayload(body?.aiResearch);

    if (rawId === undefined || rawId === null || String(rawId).trim() === '') {
      return NextResponse.json(
        { success: false, error: 'ID prospek wajib diisi.' },
        { status: 400 }
      );
    }

    if (!sanitized) {
      return NextResponse.json(
        { success: false, error: 'Payload hasil analisis AI tidak valid.' },
        { status: 400 }
      );
    }

    const saved = await updateLeadAiResearchInRepo(rawId, sanitized);
    return NextResponse.json({ success: true, aiResearch: saved });
  } catch (err) {
    console.error('Save AI research failed:', { message: err?.message });
    return NextResponse.json(
      { success: false, error: 'Gagal menyimpan hasil analisis AI ke database.' },
      { status: 500 }
    );
  }
}

