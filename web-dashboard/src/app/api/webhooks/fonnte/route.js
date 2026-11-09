import { NextResponse } from 'next/server';
import {
  listAllLeadsFromRepo,
  updateLeadAiResearchInRepo,
  updateLeadChatStatusInRepo,
  normalizePhoneKey,
} from '@/lib/leadsRepository';
import {
  deriveLeadPipelineStage,
  classifyIncomingClientReply,
  getWibTimeParts,
} from '@/lib/automationEngine';
import {
  DEFAULT_AI_SETTINGS,
  extractBusinessIdentity,
  buildQualificationReplyDraft,
  buildMuseMockupBridgePrompt,
  buildGroundedMuseResearch,
} from '@/lib/openrouter';
import {
  AUTOPILOT_DB_KEY,
  MUSE_RESULTS_DB_KEY,
  DEFAULT_AUTOPILOT_STATE,
  readJsonSetting,
  writeJsonSetting,
  safeWriteLocalTextFile,
} from '@/lib/autopilotStore';
import {
  sendWhatsAppViaFonnte,
  isBotOwnOutboundEcho,
} from '@/lib/fonnte';

async function parseWebhookPayload(request) {
  const contentType = String(request.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('application/json')) {
    return (await request.json().catch(() => ({}))) || {};
  }
  const text = await request.text().catch(() => '');
  try {
    return JSON.parse(text);
  } catch {
    const params = new URLSearchParams(text);
    const obj = {};
    for (const [k, v] of params.entries()) {
      obj[k] = v;
    }
    return obj;
  }
}

export async function GET() {
  return NextResponse.json({
    success: true,
    webhook: '/api/webhooks/fonnte',
    status: 'active',
  });
}

export async function POST(request) {
  try {
    const payload = await parseWebhookPayload(request);
    const rawSender = String(payload.sender || payload.pengirim || payload.from || '').trim();
    const rawMessage = String(payload.message || payload.pesan || payload.text || '').trim();

    if (!rawSender || !rawMessage) {
      return NextResponse.json({
        success: true,
        ignored: true,
        reason: 'Payload webhook tanpa sender atau message.',
      });
    }

    // 1. Guard against self-echo / outbound messages from the bot itself to prevent infinite loops
    if (isBotOwnOutboundEcho(rawMessage, payload)) {
      return NextResponse.json({
        success: true,
        ignored: true,
        reason: 'Pesan berasal dari bot sendiri (self-echo guard).',
      });
    }

    // 2. Ignore group messages (Fonnte group sender IDs contain '@g.us' or '-')
    if (rawSender.includes('@g.us') || rawSender.includes('-')) {
      return NextResponse.json({
        success: true,
        ignored: true,
        reason: 'Pesan grup diabaikan sesuai SOP keamanan KodeKiri.',
      });
    }

    const senderPhoneKey = normalizePhoneKey(rawSender, rawSender);
    const { leads } = await listAllLeadsFromRepo();

    const matchedLead = leads.find((l) => {
      const leadPk = normalizePhoneKey(l.phone, l.whatsapp);
      return leadPk && senderPhoneKey && leadPk === senderPhoneKey;
    });

    const state = await readJsonSetting(
      AUTOPILOT_DB_KEY,
      'autopilot-state.json',
      DEFAULT_AUTOPILOT_STATE
    );
    const fonnteToken = state.fonnteToken || process.env.FONNTE_TOKEN || '';
    const nowIso = new Date().toISOString();
    const wib = getWibTimeParts(new Date());

    const appendAutopilotLog = async (logText, logType = 'info') => {
      const entry = {
        id: `log_${Date.now()}_wh`,
        time: wib.formattedTime,
        timestamp: nowIso,
        type: logType,
        text: logText,
      };
      await writeJsonSetting(AUTOPILOT_DB_KEY, 'autopilot-state.json', {
        ...state,
        currentAction: logText,
        updatedAt: nowIso,
        activityLogs: [
          entry,
          ...(Array.isArray(state.activityLogs) ? state.activityLogs : []),
        ].slice(0, 30),
      });
    };

    if (!matchedLead) {
      await appendAutopilotLog(
        `[Webhook Fonnte] Pesan masuk dari nomor baru (${rawSender}): "${rawMessage.slice(0, 80)}"`,
        'info'
      );
      return NextResponse.json({
        success: true,
        matchedLead: false,
        sender: rawSender,
      });
    }

    if (matchedLead.aiResearch?.botPaused) {
      await appendAutopilotLog(
        `[Webhook Fonnte - Bot Paused] "${matchedLead.name.split('|')[0].trim()}" mengirim pesan: "${rawMessage.slice(0, 80)}". Menunggu balasan manual Tim KodeKiri.`,
        'warning'
      );
      return NextResponse.json({
        success: true,
        matchedLead: true,
        botPaused: true,
        leadId: matchedLead.id,
      });
    }

    const currentStage = deriveLeadPipelineStage(matchedLead);
    const classification = classifyIncomingClientReply(rawMessage, currentStage);
    const identity = extractBusinessIdentity(
      matchedLead.name,
      matchedLead.categoryName || matchedLead.category,
      matchedLead.address
    );
    const baseResearch =
      matchedLead.aiResearch || buildGroundedMuseResearch(matchedLead, DEFAULT_AI_SETTINGS);

    // Case 1: Positive interest on Chat 1 -> Auto-send Chat 2 (Qualification + https://kodekiri.tech)
    if (classification.intent === 'POSITIVE_INTEREST') {
      const chat2Text =
        baseResearch.qualificationReplyDraft ||
        buildQualificationReplyDraft(matchedLead, DEFAULT_AI_SETTINGS);

      const sendResult = await sendWhatsAppViaFonnte({
        target: rawSender,
        message: chat2Text,
        token: fonnteToken,
      });

      const updatedResearch = {
        ...baseResearch,
        pipelineStage: 'QUALIFYING',
        lastClientReply: rawMessage,
      };
      await updateLeadAiResearchInRepo(matchedLead.id, updatedResearch);
      await updateLeadChatStatusInRepo(matchedLead.id, 'SUDAH', nowIso);

      await appendAutopilotLog(
        `[Tektokan Otomatis Fonnte] "${identity.cleanBrandName}" membalas "${rawMessage.slice(0, 50)}" -> Chat 2 (kodekiri.tech + tanya layanan/logo) otomatis dikirim!`,
        'success'
      );

      return NextResponse.json({
        success: true,
        action: 'SENT_CHAT2_QUALIFICATION',
        leadId: matchedLead.id,
        nextStage: 'QUALIFYING',
        fonnteSent: sendResult.sent,
      });
    }

    // Case 2: Client provided service/logo info in QUALIFYING -> Queue Mockup in VM Muse.ai (Idempotent against multi-bubble replies!)
    if (classification.intent === 'CLIENT_INFO_PROVIDED') {
      const prevNotes = String(baseResearch.museClientNotes || '').trim();
      const incomingNote = classification.extractedClientNotes || rawMessage;
      const mergedNotes = prevNotes
        ? `${prevNotes} | ${incomingNote}`
        : incomingNote;

      const alreadyBuilding =
        Boolean(baseResearch.buildingMockup) &&
        !String(baseResearch.museShareUrl || '').trim();

      const musePrompt = buildMuseMockupBridgePrompt(
        matchedLead,
        { clientNotes: mergedNotes, referenceUrl: baseResearch.museReferenceUrl || '' },
        DEFAULT_AI_SETTINGS
      );

      const jobId = baseResearch.activeMockupJobId || `job_${Date.now()}`;
      const briefContent = `# Brief Mockup Terbaru — ${identity.cleanBrandName}
Job ID: ${jobId}
Lead ID: ${matchedLead.id}
Lead Name: ${identity.cleanBrandName}
Client WhatsApp: ${rawSender}
Created At: ${nowIso}
Output Target File: D:\\DATA SUTAN ARLIE JOHAN\\Code Johan\\mapscrapping\\.agents\\muse-results.json

${musePrompt}
`;
      await safeWriteLocalTextFile('muse-brief-latest.md', briefContent);

      const existingResults = await readJsonSetting(MUSE_RESULTS_DB_KEY, 'muse-results.json', {});
      const pendingRecord = {
        jobId,
        leadId: String(matchedLead.id),
        leadName: identity.cleanBrandName,
        whatsapp: rawSender,
        status: 'pending',
        shareUrl: '',
        prompt: musePrompt,
        message: 'Klien mengirim detail layanan via WA. Menunggu VM Muse.ai membangun mockup...',
        updatedAt: nowIso,
      };
      await writeJsonSetting(MUSE_RESULTS_DB_KEY, 'muse-results.json', {
        ...existingResults,
        latest: pendingRecord,
        byLeadId: {
          ...(existingResults.byLeadId || {}),
          [String(matchedLead.id)]: pendingRecord,
        },
      });

      const updatedResearch = {
        ...baseResearch,
        pipelineStage: 'QUALIFYING',
        buildingMockup: true,
        activeMockupJobId: jobId,
        museClientNotes: mergedNotes,
        lastClientReply: rawMessage,
      };
      await updateLeadAiResearchInRepo(matchedLead.id, updatedResearch);

      // Only send the WhatsApp acknowledgement on the FIRST info bubble so we never double-reply if the client sends 2 messages in a row!
      let sendResult = { sent: false };
      if (!alreadyBuilding) {
        const ackText = `Siap Kak, terima kasih infonya. Tim Developer KodeKiri sedang menyiapkan gambaran tampilan web singkat untuk ${identity.cleanBrandName} sesuai detail tersebut ya Kak. Begitu selesai langsung kami kirimkan link pratinjaunya ke sini.`;
        sendResult = await sendWhatsAppViaFonnte({
          target: rawSender,
          message: ackText,
          token: fonnteToken,
        });
      }

      await appendAutopilotLog(
        alreadyBuilding
          ? `[Update Brief Mockup] "${identity.cleanBrandName}" menambahkan info: "${incomingNote.slice(0, 50)}" (digabungkan ke ${jobId} tanpa kirim chat dobel).`
          : `[Auto-Trigger Mockup Muse.ai] "${identity.cleanBrandName}" mengirim detail layanan: "${mergedNotes.slice(0, 60)}" -> Brief dikirim ke VM Muse.ai (${jobId})!`,
        'success'
      );

      return NextResponse.json({
        success: true,
        action: alreadyBuilding ? 'UPDATED_MUSE_MOCKUP_NOTES' : 'QUEUED_MUSE_MOCKUP',
        jobId,
        leadId: matchedLead.id,
        fonnteAckSent: sendResult.sent,
      });
    }

    // Case 3: Handover to human (pricing / closing / custom questions) or Decline
    const updatedResearch = {
      ...baseResearch,
      pipelineStage: classification.nextStage,
      botPaused: true,
      lastClientReply: rawMessage,
    };
    await updateLeadAiResearchInRepo(matchedLead.id, updatedResearch);

    await appendAutopilotLog(
      `[${classification.nextStage === 'DECLINED' ? 'STOP' : 'HANDOVER TIM'}] "${identity.cleanBrandName}" membalas: "${rawMessage.slice(0, 70)}" -> ${classification.actionSummary}`,
      classification.nextStage === 'HANDOVER_TO_HUMAN' ? 'warning' : 'info'
    );

    return NextResponse.json({
      success: true,
      action: classification.nextStage,
      leadId: matchedLead.id,
      botPaused: true,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err?.message || 'Gagal memproses webhook Fonnte.',
      },
      { status: 500 }
    );
  }
}
