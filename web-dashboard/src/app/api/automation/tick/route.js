import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
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

function getAutopilotFiles() {
  const repoRoot = path.resolve(process.cwd(), '..');
  const agentsDir = path.join(repoRoot, '.agents');
  return {
    agentsDir,
    statePath: path.join(agentsDir, 'autopilot-state.json'),
    outboxPath: path.join(agentsDir, 'autopilot-outbox.json'),
  };
}

export async function POST() {
  try {
    const { agentsDir, statePath, outboxPath } = getAutopilotFiles();
    await fs.mkdir(agentsDir, { recursive: true });

    let state = { enabled: false };
    try {
      const raw = await fs.readFile(statePath, 'utf8');
      state = JSON.parse(raw) || { enabled: false };
    } catch {
      state = { enabled: false };
    }

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

    // Write outbound WhatsApp payload to .agents/autopilot-outbox.json for VM Muse.ai hook
    let outbox = { queue: [] };
    try {
      const rawOut = await fs.readFile(outboxPath, 'utf8');
      outbox = JSON.parse(rawOut) || { queue: [] };
    } catch {
      outbox = { queue: [] };
    }

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
    await fs.writeFile(outboxPath, JSON.stringify(nextOutbox, null, 2), 'utf8');

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
    await fs.writeFile(statePath, JSON.stringify(nextState, null, 2), 'utf8');

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
