'use client';

import { useState, useEffect, useCallback } from 'react';

export default function AutomationCommandBar({
  eligibleCount = 0,
  onRunDryRunSimulation,
  onScrapeLocationWithMuse,
  onResetAutopilotStages,
  isScrapingMuse = false,
}) {
  const [state, setState] = useState({
    enabled: false,
    startHourWib: 7,
    endHourWib: 13,
    maxDailyQuota: 20,
    sentTodayCount: 0,
    targetQuery: 'Sablon Kaos Depok, Konveksi Kabupaten Bogor, Bengkel Mobil Cibinong',
    waBridgeStatus: 'READY',
    currentAction: 'Menunggu tombol "Otomatisasikan Calon Client" diaktifkan.',
    activityLogs: [],
  });
  const [windowCheck, setWindowCheck] = useState({
    allowed: false,
    formattedTime: '--:-- WIB',
    windowLabel: '07:00 - 13:00 WIB',
    reason: 'Memeriksa jadwal operasional WIB...',
  });
  const [loading, setLoading] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [targetInput, setTargetInput] = useState(state.targetQuery);
  const [quotaInput, setQuotaInput] = useState(state.maxDailyQuota);
  const [savingConfig, setSavingConfig] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/automation/control');
      const data = await res.json().catch(() => ({}));
      if (data?.success && data.state) {
        setState(data.state);
        setTargetInput((prev) => (prev === state.targetQuery ? data.state.targetQuery : prev));
        setQuotaInput(data.state.maxDailyQuota || 20);
      }
      if (data?.windowCheck) {
        setWindowCheck(data.windowCheck);
      }
      // If Autopilot is ON and current WIB time is inside 07:00-13:00 WIB, trigger the orchestrator tick
      if (data?.state?.enabled && data?.windowCheck?.allowed) {
        const tickRes = await fetch('/api/automation/tick', { method: 'POST' });
        const tickData = await tickRes.json().catch(() => ({}));
        if (tickData?.executed && tickData?.state) {
          setState(tickData.state);
        }
      }
    } catch {
      // Ignore background poll error
    }
  }, [state.targetQuery]);

  useEffect(() => {
    fetchStatus();
    const timer = setInterval(fetchStatus, 6000);
    return () => clearInterval(timer);
  }, [fetchStatus]);

  const handleResetAutopilot = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch('/api/automation/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'RESET' }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.success && data.state) {
        setState(data.state);
        if (data.windowCheck) setWindowCheck(data.windowCheck);
      }
      if (onResetAutopilotStages) {
        await onResetAutopilotStages();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAutopilot = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch('/api/automation/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'TOGGLE',
          enabled: !state.enabled,
          targetQuery: targetInput,
          maxDailyQuota: Number(quotaInput) || 20,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.success && data.state) {
        setState(data.state);
        if (data.windowCheck) setWindowCheck(data.windowCheck);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    if (savingConfig) return;
    setSavingConfig(true);
    try {
      const res = await fetch('/api/automation/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'UPDATE_CONFIG',
          targetQuery: targetInput,
          maxDailyQuota: Number(quotaInput) || 20,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.success && data.state) {
        setState(data.state);
        if (data.windowCheck) setWindowCheck(data.windowCheck);
        setShowConfig(false);
      }
    } finally {
      setSavingConfig(false);
    }
  };

  const isRunningNow = state.enabled && windowCheck.allowed;
  const isStandbyScheduled = state.enabled && !windowCheck.allowed;

  return (
    <section
      aria-label="Pusat Kendali Otomatisasi Calon Client"
      className={`rounded-2xl border transition-all overflow-hidden ${
        isRunningNow
          ? 'bg-[#111916] border-emerald-700/80 shadow-[0_0_30px_-10px_rgba(16,185,129,0.25)]'
          : isStandbyScheduled
            ? 'bg-[#171510] border-amber-800/80'
            : 'bg-[#121215] border-zinc-800/90'
      }`}
    >
      <div className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1.5 min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                isRunningNow
                  ? 'bg-emerald-950/80 text-emerald-200 border-emerald-700'
                  : isStandbyScheduled
                    ? 'bg-amber-950/80 text-amber-200 border-amber-700'
                    : 'bg-zinc-900 text-zinc-400 border-zinc-800'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isRunningNow
                    ? 'bg-emerald-400 animate-pulse'
                    : isStandbyScheduled
                      ? 'bg-amber-400 animate-pulse'
                      : 'bg-zinc-500'
                }`}
              />
              <span>
                {isRunningNow
                  ? 'AUTOPILOT AKTIF BERJALAN'
                  : isStandbyScheduled
                    ? 'TERJADWAL (MENUNGGU 07:00 WIB)'
                    : 'AUTOPILOT NONAKTIF'}
              </span>
            </span>

            <span className="px-2.5 py-0.5 rounded-md bg-zinc-900/90 border border-zinc-800 text-[11px] font-mono text-zinc-300">
              Jadwal: 07:00 &ndash; 13:00 WIB ({windowCheck.formattedTime})
            </span>

            <span className="px-2.5 py-0.5 rounded-md bg-zinc-900/90 border border-zinc-800 text-[11px] text-zinc-300">
              Kuota Hari Ini:{' '}
              <strong className="text-white font-mono">
                {state.sentTodayCount || 0}/{state.maxDailyQuota || 20}
              </strong>{' '}
              prospek ({eligibleCount} siap di antrean)
            </span>
          </div>

          <div className="flex items-start gap-2 text-xs text-zinc-300">
            <span className="font-semibold text-white shrink-0">Pipeline Muse.ai:</span>
            <p className="line-clamp-2 text-zinc-300 leading-relaxed" title={state.currentAction}>
              {state.currentAction}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleToggleAutopilot}
            disabled={loading}
            className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-sm inline-flex items-center gap-2 cursor-pointer ${
              state.enabled
                ? 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950'
                : 'bg-zinc-100 hover:bg-white text-zinc-950'
            }`}
          >
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                state.enabled ? 'bg-zinc-950 animate-ping' : 'bg-emerald-600'
              }`}
            />
            <span>
              {loading
                ? 'Memproses...'
                : state.enabled
                  ? 'Otomatisasikan Calon Client: ON (Matikan)'
                  : 'Otomatisasikan Calon Client'}
            </span>
          </button>

          {onScrapeLocationWithMuse && (
            <button
              type="button"
              disabled={isScrapingMuse}
              onClick={() => onScrapeLocationWithMuse(targetInput, fetchStatus)}
              className="px-3 py-2.5 rounded-xl text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700 transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
              title="Scrape bisnis lokal yang belum memiliki website resmi menggunakan Muse.ai + Scrapling"
            >
              {isScrapingMuse && (
                <span className="w-3 h-3 border-2 border-zinc-400/30 border-t-white rounded-full animate-spin" />
              )}
              <span>
                {isScrapingMuse ? 'Scraping Maps...' : 'Scrape Lokasi (Muse.ai)'}
              </span>
            </button>
          )}

          {onRunDryRunSimulation && (
            <button
              type="button"
              onClick={() => onRunDryRunSimulation( fetchStatus )}
              className="px-3 py-2.5 rounded-xl text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 transition-colors"
              title="Simulasikan 1 siklus tektokan WA klien sampai pembuatan mockup & handover tim"
            >
              Simulasi Tektokan WA
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowConfig((prev) => !prev)}
            className="px-3 py-2.5 rounded-xl text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 transition-colors"
          >
            Target &amp; Batasan
          </button>

          <button
            type="button"
            onClick={() => setShowLogs((prev) => !prev)}
            className="px-3 py-2.5 rounded-xl text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 transition-colors"
          >
            Log ({state.activityLogs?.length || 0})
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={handleResetAutopilot}
            className="px-3 py-2.5 rounded-xl text-xs font-medium bg-zinc-900 hover:bg-rose-950/60 text-zinc-300 hover:text-rose-200 border border-zinc-800 hover:border-rose-800/80 transition-colors disabled:opacity-40"
            title="Reset kuota harian (0/20), log otomasi, dan kembalikan filter ke awal"
          >
            Reset Otomasi
          </button>
        </div>
      </div>

      {showConfig && (
        <form
          onSubmit={handleSaveConfig}
          className="px-4 sm:px-5 py-3.5 border-t border-zinc-800/80 bg-[#0e0e11] grid grid-cols-1 md:grid-cols-3 gap-3 items-end text-xs"
        >
          <div className="md:col-span-2 space-y-1">
            <label htmlFor="autopilot-target" className="text-[11px] font-medium text-zinc-400 block">
              Target Scraping Google Maps Harian (Kategori &amp; Kota untuk Muse.ai + Scrapling)
            </label>
            <input
              id="autopilot-target"
              type="text"
              value={targetInput}
              onChange={(e) => setTargetInput(e.target.value)}
              placeholder="Contoh: Sablon Kaos Depok, Konveksi Bogor, Bengkel Cibinong"
              className="w-full px-3 py-2 clean-input rounded-lg text-xs"
            />
          </div>

          <div className="flex items-end gap-2">
            <div className="space-y-1 flex-1">
              <label htmlFor="autopilot-quota" className="text-[11px] font-medium text-zinc-400 block">
                Batas Aman Chat Baru / Hari (07:00-13:00 WIB)
              </label>
              <input
                id="autopilot-quota"
                type="number"
                min={1}
                max={50}
                value={quotaInput}
                onChange={(e) => setQuotaInput(e.target.value)}
                className="w-full px-3 py-2 clean-input rounded-lg text-xs font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={savingConfig}
              className="px-3.5 py-2 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs transition-colors shrink-0"
            >
              {savingConfig ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </form>
      )}

      {showLogs && (
        <div className="px-4 sm:px-5 py-3.5 border-t border-zinc-800/80 bg-[#0b0b0e] space-y-2 text-xs max-h-48 overflow-y-auto">
          <div className="flex items-center justify-between text-[11px] text-zinc-400 font-semibold uppercase tracking-wider">
            <span>Riwayat Aktivitas Otomasi (VM Muse.ai &amp; WhatsApp Funnel)</span>
            <span>{windowCheck.reason}</span>
          </div>
          {!state.activityLogs || state.activityLogs.length === 0 ? (
            <p className="text-zinc-500 text-xs">Belum ada log aktivitas hari ini.</p>
          ) : (
            <ul className="space-y-1.5 font-mono text-[11px]">
              {state.activityLogs.map((item) => (
                <li
                  key={item.id}
                  className="flex items-start gap-2 text-zinc-300 border-b border-zinc-900 pb-1 last:border-none"
                >
                  <span className="text-zinc-500 shrink-0">[{item.time}]</span>
                  <span
                    className={
                      item.type === 'warning'
                        ? 'text-amber-300'
                        : item.type === 'success'
                          ? 'text-emerald-300'
                          : 'text-zinc-300'
                    }
                  >
                    {item.text}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
