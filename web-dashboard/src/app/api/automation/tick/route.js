import { NextResponse } from 'next/server';
import { evaluateAutopilotTick } from '@/lib/automationEngine';
import {
  listAllLeadsFromRepo,
  updateLeadAiResearchInRepo,
  updateLeadChatStatusInRepo,
} from '@/lib/leadsRepository';
import {
  DEFAULT_AI_SETTINGS,
  buildGroundedMuseResearch,
} from '@/lib/openrouter';
import {
  AUTOPILOT_DB_KEY,
  AUTOPILOT_OUTBOX_DB_KEY,
  DEFAULT_AUTOPILOT_STATE,
  readJsonSetting,
  writeJsonSetting,
} from '@/lib/autopilotStore';
import { sendWhatsAppViaFonnte } from '@/lib/fonnte';

export async function POST() {
  try {
    const state = await readJsonSetting(
      AUTOPILOT_DB_KEY,
      'autopilot-state.json',
      DEFAULT_AUTOPILOT_STATE
    );

    const { leads } = await listAllLeadsFromRepo();
    const tick = evaluateAutopilotTick({
      state,
      leads,
      now: new Date(),
      settings: DEFAULT_AI_SETTINGS,
    });

    if (!tick.allowed) {
      return NextResponse.json({
        success: true,
        executed: false,
        gateCode: tick.gateCode,
        reason: tick.reason,
        windowCheck: tick.windowCheck,
        sentTodayCount: tick.sentTodayCount,
        nextAllowedSendAt: tick.nextAllowedSendAt || state.nextAllowedSendAt || null,
      });
    }

    const targetLead = tick.targetLead;
    const nowIso = new Date().toISOString();
    const targetWa = targetLead.whatsapp || targetLead.phone;
    const chat1Message = tick.nextAction.whatsappMessage;

    // Send Chat 1 via Fonnte WhatsApp Gateway
    const fonnteSend = await sendWhatsAppViaFonnte({
      target: targetWa,
      message: chat1Message,
      token: state.fonnteToken || process.env.FONNTE_TOKEN || '',
    });

    // Atomic state integrity: If Fonnte token is configured but the send call failed (e.g. device disconnected), do NOT falsely mark the lead as SUDAH or increment sentTodayCount!
    if (fonnteSend.tokenConfigured && !fonnteSend.sent) {
      const failLog = {
        id: `log_${Date.now()}_err`,
        time: tick.windowCheck.formattedTime,
        timestamp: nowIso,
        type: 'warning',
        text: `[GAGAL KIRIM FONNTE] Gagal mengirim Chat 1 ke ${tick.identity.cleanBrandName} (${targetWa}): ${fonnteSend.detail || fonnteSend.reason || 'Periksa koneksi device di Fonnte'}. Status toko tetap di Antrean Baru.`,
      };

      const failState = await writeJsonSetting(AUTOPILOT_DB_KEY, 'autopilot-state.json', {
        ...state,
        currentAction: failLog.text,
        updatedAt: nowIso,
        activityLogs: [
          failLog,
          ...(Array.isArray(state.activityLogs) ? state.activityLogs : []),
        ].slice(0, 30),
      });

      return NextResponse.json({
        success: true,
        executed: false,
        gateCode: 'FONNTE_SEND_FAILED',
        reason: failLog.text,
        fonnteSent: false,
        state: failState,
        windowCheck: tick.windowCheck,
      });
    }

    const baseResearch =
      targetLead.aiResearch || buildGroundedMuseResearch(targetLead, DEFAULT_AI_SETTINGS);
    const updatedResearch = {
      ...baseResearch,
      pipelineStage: 'CHAT1_SENT',
      analyzedAt: baseResearch.analyzedAt || nowIso,
    };

    await updateLeadAiResearchInRepo(targetLead.id, updatedResearch);
    await updateLeadChatStatusInRepo(targetLead.id, 'SUDAH', nowIso);

    const outbox = await readJsonSetting(
      AUTOPILOT_OUTBOX_DB_KEY,
      'autopilot-outbox.json',
      { queue: [] }
    );

    const outboxItem = {
      jobId: `wa_${Date.now()}_${targetLead.id}`,
      leadId: String(targetLead.id),
      leadName: tick.identity.cleanBrandName,
      rawName: targetLead.name,
      categoryName: targetLead.categoryName,
      address: targetLead.address,
      whatsapp: targetWa,
      stage: 'CHAT1_SENT',
      chat1Message,
      chat2QualificationTemplate: updatedResearch.qualificationReplyDraft,
      fonnteSent: fonnteSend.sent,
      fonnteDetail: fonnteSend.detail || fonnteSend.reason || '',
      createdAt: nowIso,
    };

    const nextOutbox = {
      latest: outboxItem,
      queue: [outboxItem, ...(Array.isArray(outbox.queue) ? outbox.queue : [])].slice(0, 50),
    };
    await writeJsonSetting(AUTOPILOT_OUTBOX_DB_KEY, 'autopilot-outbox.json', nextOutbox);

    const deliveryNote = fonnteSend.sent
      ? 'Terkirim otomatis via Fonnte WA'
      : 'Disiapkan di Outbox';

    const logEntry = {
      id: `log_${Date.now()}_exec`,
      time: tick.windowCheck.formattedTime,
      timestamp: nowIso,
      type: 'success',
      text: `[AUTOPILOT 07:00-15:00 WIB] ${tick.reason} -> ${deliveryNote}.`,
    };

    const nextState = await writeJsonSetting(AUTOPILOT_DB_KEY, 'autopilot-state.json', {
      ...state,
      sentDateKey: tick.windowCheck.dateKey,
      sentTodayCount: tick.sentTodayCount,
      nextAllowedSendAt: tick.nextAllowedSendAt,
      currentAction: logEntry.text,
      updatedAt: nowIso,
      activityLogs: [
        logEntry,
        ...(Array.isArray(state.activityLogs) ? state.activityLogs : []),
      ].slice(0, 30),
    });

    const { leads: updatedAllLeads } = await listAllLeadsFromRepo();

    return NextResponse.json({
      success: true,
      executed: true,
      gateCode: tick.gateCode,
      reason: tick.reason,
      fonnteSent: fonnteSend.sent,
      state: nextState,
      windowCheck: tick.windowCheck,
      outboxItem,
      allLeads: updatedAllLeads,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err?.message || 'Gagal menjalankan siklus Autopilot Tick.',
      },
      { status: 500 }
    );
  }
}
