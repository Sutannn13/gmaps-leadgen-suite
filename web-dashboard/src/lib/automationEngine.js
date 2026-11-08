// Rationale: Deterministic state machine & time-window controller for the "Otomatisasikan Calon Client" (07:00-13:00 WIB) autonomous pipeline.

import { evaluateLeadQualification } from './leadQualification.js';
import {
  DEFAULT_AI_SETTINGS,
  extractBusinessIdentity,
  buildDefaultWaPitch,
  buildQualificationReplyDraft,
  buildMockupDeliveryDraft,
  buildMuseMockupBridgePrompt,
} from './openrouter.js';

export const OPERATING_TIMEZONE = 'Asia/Jakarta';
export const DEFAULT_START_HOUR_WIB = 7; // 07:00 WIB
export const DEFAULT_END_HOUR_WIB = 13; // 13:00 WIB
export const DEFAULT_MAX_DAILY_QUOTA = 20;

export const PIPELINE_STAGES = {
  QUEUED: {
    id: 'QUEUED',
    step: 1,
    label: 'Antrean Baru',
    shortLabel: 'Antrean',
    description: 'Belum dihubungi, siap dikirim Chat 1 pada jam 07:00-13:00 WIB.',
    badgeClass: 'bg-zinc-900 text-zinc-300 border-zinc-700',
    dotClass: 'bg-zinc-400',
  },
  CHAT1_SENT: {
    id: 'CHAT1_SENT',
    step: 2,
    label: 'Chat 1 Terkirim',
    shortLabel: 'Chat 1',
    description: 'Pesan pembuka sudah dikirim, menunggu balasan calon klien.',
    badgeClass: 'bg-sky-950/50 text-sky-200 border-sky-800/80',
    dotClass: 'bg-sky-400',
  },
  QUALIFYING: {
    id: 'QUALIFYING',
    step: 3,
    label: 'Tektokan Kualifikasi',
    shortLabel: 'Kualifikasi',
    description: 'Klien membalas positif, Chat 2 (kodekiri.tech + tanya layanan/logo) terkirim.',
    badgeClass: 'bg-amber-950/50 text-amber-200 border-amber-800/80',
    dotClass: 'bg-amber-400',
  },
  MOCKUP_SENT: {
    id: 'MOCKUP_SENT',
    step: 4,
    label: 'Mockup Terkirim',
    shortLabel: 'Mockup Live',
    description: 'Mockup 4-section dari Muse.ai sudah dikirim ke WhatsApp klien.',
    badgeClass: 'bg-indigo-950/55 text-indigo-200 border-indigo-800/80',
    dotClass: 'bg-indigo-400',
  },
  HANDOVER_TO_HUMAN: {
    id: 'HANDOVER_TO_HUMAN',
    step: 5,
    label: 'Siap Closing (Ambil Alih Tim)',
    shortLabel: 'Hot Closing',
    description: 'Klien menanyakan harga resmi/diskusi lanjut. Bot berhenti agar tim manusia yang closing.',
    badgeClass: 'bg-emerald-950/60 text-emerald-200 border-emerald-700/80',
    dotClass: 'bg-emerald-400',
  },
  DECLINED: {
    id: 'DECLINED',
    step: 0,
    label: 'Belum Butuh / Stop',
    shortLabel: 'Stop',
    description: 'Klien menyatakan belum butuh saat ini. Otomasi dihentikan untuk nomor ini.',
    badgeClass: 'bg-zinc-900/70 text-zinc-500 border-zinc-800',
    dotClass: 'bg-zinc-600',
  },
};

export function getWibTimeParts(dateInput = new Date()) {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: OPERATING_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') {
      parts[part.type] = part.value;
    }
  }

  const hour = Number(parts.hour ?? 0) % 24;
  const minute = Number(parts.minute ?? 0);
  const dateKey = `${parts.year}-${parts.month}-${parts.day}`;
  const formattedTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} WIB`;

  return {
    hour,
    minute,
    dateKey,
    formattedTime,
  };
}

export function isWithinOperatingWindow(
  dateInput = new Date(),
  startHour = DEFAULT_START_HOUR_WIB,
  endHour = DEFAULT_END_HOUR_WIB
) {
  const { hour, minute, dateKey, formattedTime } = getWibTimeParts(dateInput);
  const safeStart = Math.max(0, Math.min(23, Number(startHour) || DEFAULT_START_HOUR_WIB));
  const safeEnd = Math.max(1, Math.min(24, Number(endHour) || DEFAULT_END_HOUR_WIB));

  const totalMinutes = hour * 60 + minute;
  const startMinutes = safeStart * 60;
  const endMinutes = safeEnd * 60;

  const allowed = totalMinutes >= startMinutes && totalMinutes < endMinutes;
  const windowLabel = `${String(safeStart).padStart(2, '0')}:00 - ${String(safeEnd).padStart(2, '0')}:00 WIB`;

  let reason = `Jam operasional aktif (${formattedTime}, rentang ${windowLabel}).`;
  if (!allowed) {
    if (totalMinutes < startMinutes) {
      reason = `Standby: Saat ini pukul ${formattedTime}. Otomasi baru berjalan mulai pukul ${String(safeStart).padStart(2, '0')}:00 WIB.`;
    } else {
      reason = `Standby: Saat ini pukul ${formattedTime} (melewati batas ${String(safeEnd).padStart(2, '0')}:00 WIB). Otomasi dilanjutkan besok pukul ${String(safeStart).padStart(2, '0')}:00 WIB.`;
    }
  }

  return {
    allowed,
    hour,
    minute,
    dateKey,
    formattedTime,
    windowLabel,
    reason,
  };
}

export function deriveLeadPipelineStage(lead = {}) {
  const explicitStage = String(lead?.aiResearch?.pipelineStage || '').toUpperCase().trim();
  const hasMockupUrl = Boolean(
    String(lead?.aiResearch?.museShareUrl || lead?.museShareUrl || '').trim()
  );

  if (explicitStage === 'HANDOVER_TO_HUMAN' || explicitStage === 'DECLINED') {
    return explicitStage;
  }

  if (hasMockupUrl) {
    return 'MOCKUP_SENT';
  }

  if (explicitStage && PIPELINE_STAGES[explicitStage]) {
    return explicitStage;
  }

  const hasClientNotes = Boolean(String(lead?.aiResearch?.museClientNotes || '').trim());
  if (hasClientNotes) {
    return 'QUALIFYING';
  }

  if (lead?.chatStatus === 'SUDAH') {
    return 'CHAT1_SENT';
  }

  return 'QUEUED';
}

export function classifyIncomingClientReply(replyText = '', currentStage = 'CHAT1_SENT') {
  const clean = String(replyText || '').trim();
  const lower = clean.toLowerCase();

  if (!clean) {
    return {
      intent: 'EMPTY',
      nextStage: currentStage,
      botPaused: false,
      actionSummary: 'Pesan balasan kosong, tidak ada perubahan status.',
    };
  }

  // 1. Check hard decline / opt-out first
  if (
    /\b(?:tidak\s*butuh|belum\s*butuh|nggak\s*dulu|ga\s*dulu|gak\s*dulu|tidak\s*minat|jangan\s*chat|udah\s*punya|sudah\s*ada\s*web|skip\s*dulu|maaf\s*belum)\b/i.test(
      lower
    )
  ) {
    return {
      intent: 'DECLINE',
      nextStage: 'DECLINED',
      botPaused: true,
      actionSummary: 'Klien menyatakan belum butuh. Bot otomatis berhenti untuk nomor ini.',
    };
  }

  // 2. Check pricing negotiation, custom technical request, or closing signals -> HANDOVER_TO_HUMAN
  if (
    /\b(?:berapa\s*harga|biaya\s*buat|harga\s*paket|biayanya\s*berapa|bayar\s*berapa|bisa\s*kurang|diskon|nego|ketemuan|meeting|telepon|telpon|lanjut\s*bikin|aktifkan\s*domain|cara\s*bayar|dp\s*berapa|deal|cocok\s*kak)\b/i.test(
      lower
    )
  ) {
    return {
      intent: 'HANDOVER_CLOSING',
      nextStage: 'HANDOVER_TO_HUMAN',
      botPaused: true,
      actionSummary:
        'Klien menanyakan harga resmi / siap lanjut closing! Bot di-pause otomatis agar Tim Developer KodeKiri mengambil alih.',
    };
  }

  // 3. If currently in CHAT1_SENT (or QUEUED) and client replies positively ("Boleh", "Bileh", "Mau liat", etc.)
  if (
    currentStage === 'CHAT1_SENT' ||
    currentStage === 'QUEUED'
  ) {
    if (
      /\b(?:boleh|bileh|blh|mau|lihat|liat|kirim|coba|gimana|contoh|katalog|info|oke|ok|siap|bisa)\b/i.test(
        lower
      )
    ) {
      return {
        intent: 'POSITIVE_INTEREST',
        nextStage: 'QUALIFYING',
        botPaused: false,
        actionSummary:
          'Klien membalas positif ("Boleh"). Mengirimkan Chat 2 (link https://kodekiri.tech + pertanyaan kualifikasi layanan/logo).',
      };
    }
  }

  // 4. If currently in QUALIFYING and client replies with service/product details
  if (currentStage === 'QUALIFYING') {
    return {
      intent: 'CLIENT_INFO_PROVIDED',
      nextStage: 'MOCKUP_SENT',
      botPaused: false,
      extractedClientNotes: clean,
      actionSummary:
        'Klien memberikan detail layanan/produk. Memicu VM Muse.ai untuk membangun mockup 4-section (Anti-Dummy) dan mengirimkan link pratinjau.',
    };
  }

  // 5. If already in MOCKUP_SENT and client responds with feedback/questions -> Handover to human
  if (currentStage === 'MOCKUP_SENT') {
    return {
      intent: 'HANDOVER_CLOSING',
      nextStage: 'HANDOVER_TO_HUMAN',
      botPaused: true,
      actionSummary:
        'Klien merespons setelah melihat mockup. Dialihkan ke Tim Developer KodeKiri untuk diskusi penutupan (closing).',
    };
  }

  return {
    intent: 'NEEDS_REVIEW',
    nextStage: 'HANDOVER_TO_HUMAN',
    botPaused: true,
    actionSummary:
      'Balasan klien membutuhkan pengecekan manusia. Bot di-pause agar tim dapat merespons dengan tepat.',
  };
}

export function computeHumanJitterDelayMs(minMinutes = 8, maxMinutes = 15, randomFn = Math.random) {
  const safeMin = Math.max(1, Number(minMinutes) || 8);
  const safeMax = Math.max(safeMin, Number(maxMinutes) || 15);
  const minutes = safeMin + randomFn() * (safeMax - safeMin);
  return Math.round(minutes * 60 * 1000);
}

export function filterEligibleAutopilotLeads(leads = [], maxDailyQuota = DEFAULT_MAX_DAILY_QUOTA) {
  const safeQuota = Math.max(1, Math.min(100, Number(maxDailyQuota) || DEFAULT_MAX_DAILY_QUOTA));
  const eligible = [];

  for (const lead of leads) {
    if (!lead) continue;
    const evaluation = evaluateLeadQualification(lead);
    if (evaluation.status !== 'WORTH_PROSPECTING' || !evaluation.hasMobileWa) {
      continue;
    }

    const stage = deriveLeadPipelineStage(lead);
    if (stage === 'DECLINED' || stage === 'HANDOVER_TO_HUMAN') {
      continue;
    }

    if (Boolean(lead?.aiResearch?.botPaused)) {
      continue;
    }

    eligible.push({
      lead,
      stage,
      tier: evaluation.tier,
      identity: extractBusinessIdentity(
        lead.name,
        lead.categoryName || lead.category,
        lead.address
      ),
    });

    if (eligible.length >= safeQuota) {
      break;
    }
  }

  return eligible;
}

export function buildAutopilotNextActionForLead(lead = {}, settings = DEFAULT_AI_SETTINGS) {
  const stage = deriveLeadPipelineStage(lead);
  const identity = extractBusinessIdentity(
    lead.name,
    lead.categoryName || lead.category,
    lead.address
  );

  if (stage === 'QUEUED') {
    return {
      currentStage: 'QUEUED',
      nextStage: 'CHAT1_SENT',
      actionType: 'SEND_CHAT_1',
      label: `Kirim Chat 1 Pembuka ke ${identity.cleanBrandName}`,
      whatsappMessage: lead?.aiResearch?.pitchDraft || buildDefaultWaPitch(lead, settings),
    };
  }

  if (stage === 'CHAT1_SENT') {
    return {
      currentStage: 'CHAT1_SENT',
      nextStage: 'QUALIFYING',
      actionType: 'WAIT_OR_QUALIFY',
      label: `Tunggu balasan "Boleh" dari ${identity.cleanBrandName} lalu kirim Chat 2 (kodekiri.tech)`,
      whatsappMessage:
        lead?.aiResearch?.qualificationReplyDraft ||
        buildQualificationReplyDraft(lead, settings),
    };
  }

  if (stage === 'QUALIFYING') {
    const prompt = buildMuseMockupBridgePrompt(
      lead,
      {
        clientNotes: lead?.aiResearch?.museClientNotes || '',
        referenceUrl: lead?.aiResearch?.museReferenceUrl || '',
      },
      settings
    );
    return {
      currentStage: 'QUALIFYING',
      nextStage: 'MOCKUP_SENT',
      actionType: 'BUILD_AND_SEND_MOCKUP',
      label: `Bangun Mockup 4-Section via VM Muse.ai untuk ${identity.cleanBrandName}`,
      musePrompt: prompt,
      whatsappMessage: buildMockupDeliveryDraft(
        lead,
        lead?.aiResearch?.museShareUrl || '',
        settings
      ),
    };
  }

  return {
    currentStage: stage,
    nextStage: 'HANDOVER_TO_HUMAN',
    actionType: 'HUMAN_HANDOVER',
    label: `Prospek ${identity.cleanBrandName} siap ditindaklanjuti oleh Tim Developer KodeKiri`,
    whatsappMessage: '',
  };
}

export function evaluateAutopilotTick({
  state = {},
  leads = [],
  now = new Date(),
  settings = DEFAULT_AI_SETTINGS,
  randomFn = Math.random,
} = {}) {
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const startHour = Number(state.startHourWib ?? DEFAULT_START_HOUR_WIB);
  const endHour = Number(state.endHourWib ?? DEFAULT_END_HOUR_WIB);
  const maxQuota = Math.max(1, Number(state.maxDailyQuota || DEFAULT_MAX_DAILY_QUOTA));
  const windowCheck = isWithinOperatingWindow(new Date(nowMs), startHour, endHour);

  const sentToday =
    state.sentDateKey && state.sentDateKey !== windowCheck.dateKey
      ? 0
      : Number(state.sentTodayCount || 0);

  // Gate 1: Master switch must be ON
  if (!state.enabled) {
    return {
      allowed: false,
      gateCode: 'DISABLED',
      reason: 'Tombol "Otomatisasikan Calon Client" masih NONAKTIF (OFF).',
      windowCheck,
      sentTodayCount: sentToday,
    };
  }

  // Gate 2: Must be within 07:00 - 13:00 WIB operating window
  if (!windowCheck.allowed) {
    return {
      allowed: false,
      gateCode: 'OUTSIDE_OPERATING_HOURS',
      reason: windowCheck.reason,
      windowCheck,
      sentTodayCount: sentToday,
    };
  }

  // Gate 3: Daily quota check
  if (sentToday >= maxQuota) {
    return {
      allowed: false,
      gateCode: 'QUOTA_REACHED',
      reason: `Kuota harian maksimum (${sentToday}/${maxQuota} prospek) untuk hari ini sudah tercapai. Dilanjutkan besok pukul 07:00 WIB.`,
      windowCheck,
      sentTodayCount: sentToday,
    };
  }

  // Gate 4: Human jitter cooldown check (8-15 minutes between outbound Chat 1 sends)
  const nextAllowedMs = state.nextAllowedSendAt ? new Date(state.nextAllowedSendAt).getTime() : 0;
  if (nextAllowedMs && nowMs < nextAllowedMs) {
    const waitMinutes = Math.max(1, Math.ceil((nextAllowedMs - nowMs) / 60000));
    return {
      allowed: false,
      gateCode: 'COOLDOWN_JITTER',
      reason: `Menunggu jeda aman anti-spam WhatsApp (~${waitMinutes} menit lagi sebelum mengirim ke prospek berikutnya).`,
      windowCheck,
      sentTodayCount: sentToday,
      nextAllowedSendAt: new Date(nextAllowedMs).toISOString(),
    };
  }

  // Find eligible QUEUED prospects (no owned website, active mobile WA, not paused)
  const eligible = filterEligibleAutopilotLeads(leads, maxQuota);
  const nextQueued = eligible.find((item) => item.stage === 'QUEUED');

  if (!nextQueued) {
    return {
      allowed: false,
      gateCode: 'QUEUE_EMPTY',
      reason:
        'Tidak ada prospek berstatus Antrean Baru yang belum dihubungi. Klik "Scrape Lokasi (Muse.ai)" untuk menambah antrean.',
      windowCheck,
      sentTodayCount: sentToday,
    };
  }

  const nextAction = buildAutopilotNextActionForLead(nextQueued.lead, settings);
  const jitterMs = computeHumanJitterDelayMs(8, 15, randomFn);
  const nextSendIso = new Date(nowMs + jitterMs).toISOString();

  return {
    allowed: true,
    gateCode: 'EXECUTE_SEND_CHAT1',
    reason: `Mengirim Chat 1 Pembuka ke ${nextQueued.identity.cleanBrandName} (${nextQueued.lead.whatsapp || nextQueued.lead.phone}).`,
    windowCheck,
    sentTodayCount: sentToday + 1,
    nextAllowedSendAt: nextSendIso,
    targetLead: nextQueued.lead,
    identity: nextQueued.identity,
    nextAction,
  };
}
