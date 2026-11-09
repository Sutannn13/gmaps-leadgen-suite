import { NextResponse } from 'next/server';
import { evaluateAutopilotTick } from '@/lib/automationEngine';
import {
  readAutopilotStateFromStore,
  saveAutopilotStateToStore,
  readAutopilotOutboxFromStore,
  saveAutopilotOutboxToStore,
} from '@/lib/autopilotStore';
import {
  listAllLeadsFromRepo,
  updateLeadAiResearchInRepo,
  updateLeadChatStatusInRepo,
} from '@/lib/leadsRepository';
import {
  DEFAULT_AI_SETTINGS,
  buildGroundedMuseResearch,
} from '@/lib/openrouter';

export const maxDuration = 60; // Izinkan durasi hingga 60 detik untuk serverless execution di Vercel

export async function POST() {
  try {
    const state = await readAutopilotStateFromStore();
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
    const baseResearch =
      targetLead.aiResearch || buildGroundedMuseResearch(targetLead, DEFAULT_AI_SETTINGS);
    const updatedResearch = {
      ...baseResearch,
      pipelineStage: 'CHAT1_SENT',
      analyzedAt: baseResearch.analyzedAt || new Date().toISOString(),
    };

    const nowIso = new Date().toISOString();
    await updateLeadAiResearchInRepo(targetLead.id, updatedResearch);
    await updateLeadChatStatusInRepo(targetLead.id, 'SUDAH', nowIso);

    // Save outbound WhatsApp payload to durable store (Neon DB / local queue)
    const outbox = await readAutopilotOutboxFromStore();
    const outboxItem = {
      jobId: `wa_${Date.now()}_${targetLead.id}`,
      leadId: String(targetLead.id),
      leadName: tick.identity.cleanBrandName,
      rawName: targetLead.name,
      categoryName: targetLead.categoryName,
      address: targetLead.address,
      whatsapp: targetLead.whatsapp || targetLead.phone,
      stage: 'CHAT1_SENT',
      chat1Message: tick.nextAction.whatsappMessage,
      chat2QualificationTemplate: updatedResearch.qualificationReplyDraft,
      createdAt: nowIso,
    };

    const nextOutbox = {
      latest: outboxItem,
      queue: [outboxItem, ...(Array.isArray(outbox.queue) ? outbox.queue : [])].slice(0, 50),
    };
    await saveAutopilotOutboxToStore(nextOutbox);

    const logEntry = {
      id: `log_${Date.now()}_exec`,
      time: tick.windowCheck.formattedTime,
      timestamp: nowIso,
      type: 'success',
      text: `[AUTOPILOT 07:00-13:00 WIB] ${tick.reason}`,
    };

    const nextState = {
      ...state,
      sentDateKey: tick.windowCheck.dateKey,
      sentTodayCount: tick.sentTodayCount,
      nextAllowedSendAt: tick.nextAllowedSendAt,
      currentAction: logEntry.text,
      updatedAt: nowIso,
      activityLogs: [logEntry, ...(Array.isArray(state.activityLogs) ? state.activityLogs : [])].slice(
        0,
        30
      ),
    };
    await saveAutopilotStateToStore(nextState);

    const { leads: updatedAllLeads } = await listAllLeadsFromRepo();

    return NextResponse.json({
      success: true,
      executed: true,
      gateCode: tick.gateCode,
      reason: tick.reason,
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
