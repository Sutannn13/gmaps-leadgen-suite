import { NextResponse } from 'next/server';
import {
  DEFAULT_START_HOUR_WIB,
  DEFAULT_END_HOUR_WIB,
  DEFAULT_MAX_DAILY_QUOTA,
  isWithinOperatingWindow,
  classifyIncomingClientReply,
} from '@/lib/automationEngine';
import {
  DEFAULT_AUTOPILOT_STATE,
  readAutopilotStateFromStore,
  saveAutopilotStateToStore,
} from '@/lib/autopilotStore';

export async function GET() {
  try {
    const state = await readAutopilotStateFromStore();
    const windowCheck = isWithinOperatingWindow(
      new Date(),
      state.startHourWib,
      state.endHourWib
    );

    const effectiveState =
      state.sentDateKey && state.sentDateKey !== windowCheck.dateKey
        ? { ...state, sentTodayCount: 0, sentDateKey: windowCheck.dateKey }
        : { ...state, sentDateKey: state.sentDateKey || windowCheck.dateKey };

    return NextResponse.json({
      success: true,
      state: effectiveState,
      windowCheck,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Gagal membaca state autopilot.' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const action = String(body?.action || 'TOGGLE').toUpperCase().trim();
    const current = await readAutopilotStateFromStore();
    const nowIso = new Date().toISOString();
    const windowCheck = isWithinOperatingWindow(
      new Date(),
      body?.startHourWib ?? current.startHourWib,
      body?.endHourWib ?? current.endHourWib
    );

    const appendLog = (text, type = 'info') => [
      {
        id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        time: windowCheck.formattedTime,
        timestamp: nowIso,
        type,
        text,
      },
      ...(current.activityLogs || []),
    ].slice(0, 30);

    if (action === 'RESET') {
      const resetState = await saveAutopilotStateToStore({
        ...DEFAULT_AUTOPILOT_STATE,
        targetQuery: current.targetQuery || DEFAULT_AUTOPILOT_STATE.targetQuery,
        maxDailyQuota: current.maxDailyQuota || DEFAULT_MAX_DAILY_QUOTA,
        sentDateKey: windowCheck.dateKey,
        sentTodayCount: 0,
        currentAction: 'Status otomasi, kuota harian (0/20), dan log berhasil di-reset.',
        updatedAt: nowIso,
        activityLogs: [
          {
            id: `log_${Date.now()}_reset`,
            time: windowCheck.formattedTime,
            timestamp: nowIso,
            type: 'info',
            text: 'Status otomasi, kuota harian (0/20), dan log aktivitas telah di-reset.',
          },
        ],
      });

      return NextResponse.json({
        success: true,
        state: resetState,
        windowCheck,
      });
    }

    if (action === 'TOGGLE') {
      const nextEnabled =
        typeof body?.enabled === 'boolean' ? body.enabled : !current.enabled;

      const statusMsg = nextEnabled
        ? windowCheck.allowed
          ? `Autopilot AKTIF (${windowCheck.windowLabel}). VM Muse.ai menjalankan siklus scraping Maps, pengiriman Chat 1 WA, dan tektokan kualifikasi.`
          : `Autopilot DIJADWALKAN AKTIF. Saat ini di luar jam kerja (${windowCheck.formattedTime}), VM Muse.ai otomatis mulai berjalan pukul 07:00 WIB.`
        : 'Autopilot DINONAKTIFKAN. Seluruh proses scraping & balasan WA otomatis dihentikan.';

      const nextState = await saveAutopilotStateToStore({
        ...current,
        enabled: nextEnabled,
        targetQuery: String(body?.targetQuery ?? current.targetQuery).trim() || current.targetQuery,
        maxDailyQuota: Number(body?.maxDailyQuota || current.maxDailyQuota) || DEFAULT_MAX_DAILY_QUOTA,
        fonnteToken: String(body?.fonnteToken ?? current.fonnteToken ?? '').trim(),
        currentAction: statusMsg,
        lastTriggeredAt: nextEnabled ? nowIso : current.lastTriggeredAt,
        updatedAt: nowIso,
        activityLogs: appendLog(statusMsg, nextEnabled ? 'success' : 'warning'),
      });

      return NextResponse.json({
        success: true,
        state: nextState,
        windowCheck,
      });
    }

    if (action === 'UPDATE_CONFIG') {
      const nextTarget = String(body?.targetQuery ?? current.targetQuery).trim() || current.targetQuery;
      const nextQuota = Math.max(
        1,
        Math.min(100, Number(body?.maxDailyQuota || current.maxDailyQuota) || DEFAULT_MAX_DAILY_QUOTA)
      );

      const nextFonnteToken =
        body?.fonnteToken !== undefined
          ? String(body.fonnteToken || '').trim()
          : String(current.fonnteToken || '').trim();

      const nextState = await saveAutopilotStateToStore({
        ...current,
        targetQuery: nextTarget,
        maxDailyQuota: nextQuota,
        fonnteToken: nextFonnteToken,
        updatedAt: nowIso,
        activityLogs: appendLog(
          `Konfigurasi diperbarui: Target "${nextTarget}" (Kuota maks ${nextQuota} prospek/hari, jam 07:00-13:00 WIB).`,
          'info'
        ),
      });

      return NextResponse.json({
        success: true,
        state: nextState,
        windowCheck,
      });
    }

    if (action === 'SIMULATE_REPLY') {
      const leadName = String(body?.leadName || 'Prospek').trim();
      const currentStage = String(body?.currentStage || 'CHAT1_SENT').trim();
      const replyText = String(body?.replyText || '').trim();

      const classification = classifyIncomingClientReply(replyText, currentStage);
      const logLine = `[Tektokan WA - ${leadName}] Klien membalas: "${replyText}" -> ${classification.actionSummary}`;

      const nextState = await saveAutopilotStateToStore({
        ...current,
        currentAction: logLine,
        updatedAt: nowIso,
        activityLogs: appendLog(
          logLine,
          classification.nextStage === 'HANDOVER_TO_HUMAN' ? 'warning' : 'success'
        ),
      });

      return NextResponse.json({
        success: true,
        classification,
        state: nextState,
        windowCheck,
      });
    }

    if (action === 'LOG_EVENT') {
      const message = String(body?.message || 'Aktivitas diterima dari VM Muse.ai').trim();
      const eventType = String(body?.type || 'info').trim();
      const incSent = Boolean(body?.incrementSent);
      const baseTodayCount =
        current.sentDateKey && current.sentDateKey !== windowCheck.dateKey
          ? 0
          : current.sentTodayCount || 0;

      const nextState = await saveAutopilotStateToStore({
        ...current,
        sentDateKey: windowCheck.dateKey,
        sentTodayCount: incSent ? baseTodayCount + 1 : baseTodayCount,
        currentAction: message,
        updatedAt: nowIso,
        activityLogs: appendLog(message, eventType),
      });

      return NextResponse.json({
        success: true,
        state: nextState,
        windowCheck,
      });
    }

    return NextResponse.json(
      { success: false, error: `Action "${action}" tidak dikenali.` },
      { status: 400 }
    );
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Gagal memperbarui state autopilot.' },
      { status: 500 }
    );
  }
}
