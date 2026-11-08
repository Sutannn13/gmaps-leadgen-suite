'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  DEFAULT_AI_SETTINGS,
  extractBusinessIdentity,
  buildDefaultWaPitch,
  buildQualificationReplyDraft,
  buildMuseMockupBridgePrompt,
  buildMockupDeliveryDraft,
} from '@/lib/openrouter';
import {
  PIPELINE_STAGES,
  deriveLeadPipelineStage,
} from '@/lib/automationEngine';

export default function AiLeadModal({
  lead,
  aiSettings = DEFAULT_AI_SETTINGS,
  isAnalyzing,
  onClose,
  onReanalyze,
  onSaveEditedPitch,
  normalizeWa,
}) {
  const research = lead?.aiResearch || {};
  const identity = useMemo(
    () =>
      extractBusinessIdentity(
        lead?.name,
        lead?.categoryName || lead?.category,
        lead?.address
      ),
    [lead?.name, lead?.categoryName, lead?.category, lead?.address]
  );

  const defaultPrimary = useMemo(
    () => research.pitchDraft || buildDefaultWaPitch(lead, aiSettings),
    [research.pitchDraft, lead, aiSettings]
  );
  const defaultQual = useMemo(
    () => research.qualificationReplyDraft || buildQualificationReplyDraft(lead, aiSettings),
    [research.qualificationReplyDraft, lead, aiSettings]
  );

  const [activeTab, setActiveTab] = useState('primary'); // 'primary' | 'qualification' | 'muse' | 'followup'
  const [primaryText, setPrimaryText] = useState(() => defaultPrimary);
  const [qualText, setQualText] = useState(() => defaultQual);
  const [followUpText, setFollowUpText] = useState(() => research.followUpDraft || '');
  const [museClientNotes, setMuseClientNotes] = useState(() => research.museClientNotes || '');
  const [museReferenceUrl, setMuseReferenceUrl] = useState(() => research.museReferenceUrl || '');
  const [museShareUrl, setMuseShareUrl] = useState(() => research.museShareUrl || '');
  const [pipelineStage, setPipelineStage] = useState(() => deriveLeadPipelineStage(lead));
  const [botPaused, setBotPaused] = useState(() => Boolean(research.botPaused));

  const [savingPitch, setSavingPitch] = useState(false);
  const [saveNotice, setSaveNotice] = useState(null);
  const [copied, setCopied] = useState(false);
  const [copiedMusePrompt, setCopiedMusePrompt] = useState(false);
  const [museAutoState, setMuseAutoState] = useState({
    running: false,
    jobId: '',
    statusText: '',
  });

  useEffect(() => {
    if (!museAutoState.running || !lead?.id) return;
    let cancelled = false;

    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/ai/muse-queue?leadId=${encodeURIComponent(lead.id)}`);
        const data = await res.json().catch(() => ({}));
        if (cancelled || !data?.result) return;

        const r = data.result;
        const jobMatches =
          !museAutoState.jobId || !r.jobId || r.jobId === museAutoState.jobId;
        const leadMatches =
          !r.leadId || String(r.leadId) === String(lead.id);

        if (
          jobMatches &&
          leadMatches &&
          r.shareUrl &&
          (r.status === 'completed' || r.shareUrl.startsWith('https://muse.ai/s/'))
        ) {
          const nextSt =
            pipelineStage === 'HANDOVER_TO_HUMAN' || pipelineStage === 'DECLINED'
              ? pipelineStage
              : 'MOCKUP_SENT';
          setMuseShareUrl(r.shareUrl);
          setPipelineStage(nextSt);
          setMuseAutoState({
            running: false,
            jobId: r.jobId || '',
            statusText: r.message || 'Mockup selesai dibuat oleh Muse.ai dan link otomatis terisi!',
          });
          onSaveEditedPitch(lead.id, {
            ...(lead?.aiResearch || {}),
            pitchDraft: primaryText,
            qualificationReplyDraft: qualText,
            followUpDraft: followUpText,
            museClientNotes,
            museReferenceUrl,
            museShareUrl: r.shareUrl,
            pipelineStage: nextSt,
            botPaused,
          }).catch(() => {});
        } else if (r.status === 'running') {
          setMuseAutoState((prev) => ({
            ...prev,
            statusText: r.message || 'Muse.ai sedang membangun mockup & menjalankan Cross-Check Anti-Dummy...',
          }));
        }
      } catch {
        // Ignore transient poll errors
      }
    }, 3500);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [
    museAutoState.running,
    lead?.id,
    lead?.aiResearch,
    primaryText,
    qualText,
    followUpText,
    museClientNotes,
    museReferenceUrl,
    onSaveEditedPitch,
  ]);

  if (!lead) return null;

  const qual = research.leadQualification || 'WARM LEAD';
  const score = research.leadScore;
  const waDigits = normalizeWa(lead.whatsapp || lead.phone);

  const museBridgePrompt = buildMuseMockupBridgePrompt(
    lead,
    {
      clientNotes: museClientNotes,
      referenceUrl: museReferenceUrl,
    },
    aiSettings
  );

  const mockupDeliveryText = buildMockupDeliveryDraft(lead, museShareUrl, aiSettings);

  const currentMessage =
    activeTab === 'qualification'
      ? qualText
      : activeTab === 'followup'
        ? followUpText
        : activeTab === 'muse'
          ? mockupDeliveryText
          : primaryText;

  const isDirty =
    primaryText !== defaultPrimary ||
    qualText !== defaultQual ||
    followUpText !== (research.followUpDraft || '') ||
    museClientNotes !== (research.museClientNotes || '') ||
    museReferenceUrl !== (research.museReferenceUrl || '') ||
    museShareUrl !== (research.museShareUrl || '') ||
    pipelineStage !== deriveLeadPipelineStage(lead) ||
    botPaused !== Boolean(research.botPaused);

  const qualBadgeStyle = qual.includes('HOT')
    ? 'bg-rose-950/50 text-rose-200 border-rose-900/70'
    : qual.includes('COLD')
      ? 'bg-zinc-900 text-zinc-400 border-zinc-800'
      : 'bg-amber-950/50 text-amber-200 border-amber-900/70';

  const handleCopy = async () => {
    if (!currentMessage) return;
    try {
      await navigator.clipboard.writeText(currentMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setSaveNotice({ type: 'error', text: 'Gagal menyalin teks ke clipboard.' });
    }
  };

  const handleCopyMusePrompt = async () => {
    try {
      await navigator.clipboard.writeText(museBridgePrompt);
      setCopiedMusePrompt(true);
      setTimeout(() => setCopiedMusePrompt(false), 2500);
    } catch {
      setSaveNotice({ type: 'error', text: 'Gagal menyalin prompt Muse.ai ke clipboard.' });
    }
  };

  const handleSaveEdits = async () => {
    if (savingPitch || !isDirty) return;
    setSavingPitch(true);
    setSaveNotice(null);
    try {
      await onSaveEditedPitch(lead.id, {
        ...research,
        pitchDraft: primaryText,
        qualificationReplyDraft: qualText,
        followUpDraft: followUpText,
        museClientNotes,
        museReferenceUrl,
        museShareUrl,
        pipelineStage,
        botPaused,
      });
      setSaveNotice({
        type: 'success',
        text: 'Draft pesan & konfigurasi Bridge Muse.ai tersimpan ke database.',
      });
    } catch (err) {
      setSaveNotice({
        type: 'error',
        text: err?.message || 'Gagal menyimpan perubahan draft ke database.',
      });
    } finally {
      setSavingPitch(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="clean-card w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl max-h-[92dvh] flex flex-col shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-white truncate">
                {identity.cleanBrandName}
              </h3>
              {identity.cleanBrandName !== lead.name && (
                <span className="text-[11px] px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 truncate max-w-[260px]" title={lead.name}>
                  Maps: {lead.name}
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-400 truncate mt-0.5">
              {lead.categoryName || 'Bisnis Lokal'}
              {identity.extractedSpecialty ? ` (${identity.extractedSpecialty})` : ''} &bull;{' '}
              {lead.address || 'Alamat tidak tersedia'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition-colors shrink-0"
            aria-label="Tutup detail analisis AI"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto text-xs flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`px-2.5 py-1 rounded-lg font-semibold border ${qualBadgeStyle}`}>
                {qual}
              </span>
              {typeof score === 'number' && (
                <span className="px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 font-mono">
                  Skor {score}/100
                </span>
              )}
              <span className="px-2.5 py-1 rounded-lg bg-zinc-900/80 border border-zinc-800 text-zinc-300">
                {research.opportunityType || identity.opportunityDefault}
              </span>
            </div>

            <button
              type="button"
              onClick={() => onReanalyze(lead)}
              disabled={isAnalyzing}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 transition-colors disabled:opacity-40"
            >
              {isAnalyzing ? (
                <>
                  <span className="w-3 h-3 border-2 border-zinc-400/30 border-t-zinc-200 rounded-full animate-spin" />
                  <span>Menganalisis...</span>
                </>
              ) : (
                <span>Analisis Ulang AI</span>
              )}
            </button>
          </div>

          <div className="p-3 rounded-xl bg-[#18181b] border border-zinc-800/90 flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                Tahap Funnel:
              </span>
              <select
                aria-label="Tahap Funnel Prospek"
                value={pipelineStage}
                onChange={(e) => {
                  const nextSt = e.target.value;
                  setPipelineStage(nextSt);
                  if (nextSt === 'HANDOVER_TO_HUMAN' || nextSt === 'DECLINED') {
                    setBotPaused(true);
                  }
                }}
                className="px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-100 text-xs font-medium"
              >
                {Object.values(PIPELINE_STAGES).map((st) => (
                  <option key={st.id} value={st.id} className="bg-zinc-900 text-zinc-100">
                    {st.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => setBotPaused((prev) => !prev)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                botPaused
                  ? 'bg-emerald-950/60 text-emerald-200 border-emerald-700'
                  : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:border-zinc-500'
              }`}
            >
              {botPaused
                ? 'Diambil Alih Tim (Bot Pause)'
                : 'Ambil Alih Manual (Pause Bot)'}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-[#18181b] border border-zinc-800/90 space-y-1">
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
                Ringkasan Jejak Digital
              </span>
              <p className="text-zinc-200 leading-relaxed">
                {research.digitalPresenceSummary || 'Belum ada ringkasan analisis.'}
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-[#18181b] border border-zinc-800/90 space-y-1">
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
                Sudut Penawaran (Pitch Angle)
              </span>
              <p className="text-zinc-200 leading-relaxed">
                {research.pitchAngle || `Tawarkan pembuatan ${identity.valuePropLabel}.`}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div
                role="tablist"
                aria-label="Tahapan pesan WhatsApp dan Bridge Muse.ai"
                className="inline-flex flex-wrap p-0.5 rounded-lg bg-zinc-900 border border-zinc-800 gap-0.5"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'primary'}
                  onClick={() => setActiveTab('primary')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    activeTab === 'primary'
                      ? 'bg-zinc-100 text-zinc-950 font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  1. Chat Pembuka
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'qualification'}
                  onClick={() => setActiveTab('qualification')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    activeTab === 'qualification'
                      ? 'bg-zinc-100 text-zinc-950 font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  2. Kualifikasi (Boleh)
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'muse'}
                  onClick={() => setActiveTab('muse')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    activeTab === 'muse'
                      ? 'bg-zinc-100 text-zinc-950 font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  3. Bridge Muse.ai
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'followup'}
                  onClick={() => setActiveTab('followup')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    activeTab === 'followup'
                      ? 'bg-zinc-100 text-zinc-950 font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  4. Follow-up H+3
                </button>
              </div>

              {isDirty && (
                <button
                  type="button"
                  onClick={handleSaveEdits}
                  disabled={savingPitch}
                  className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-medium border border-zinc-700 transition-colors disabled:opacity-40"
                >
                  {savingPitch ? 'Menyimpan...' : 'Simpan ke DB'}
                </button>
              )}
            </div>

            {activeTab === 'muse' ? (
              <div className="space-y-3 p-3.5 rounded-xl bg-[#18181b] border border-zinc-800">
                <div className="space-y-1">
                  <span className="text-[11px] font-semibold text-zinc-200 block">
                    Bridge Pembuatan Mockup Landing Page di Muse.ai (Anti-Slop &amp; Anti-Dummy)
                  </span>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Isi jawaban kualifikasi klien dari Chat 2 dan URL website referensi premium (opsional). Prompt di bawah otomatis menggabungkan skill <code className="text-zinc-300">reverse-engineer-anything</code>, <code className="text-zinc-300">marketingskills/cro</code>, <code className="text-zinc-300">humanizer</code>, serta <strong>Cross-Check Anti-Dummy 5 Poin</strong> dan <strong>Batasan 4 Section Pratinjau KodeKiri</strong>.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label htmlFor="muse-client-notes" className="text-[11px] text-zinc-300 font-medium block">
                      Info Layanan / Logo dari Balasan Chat 2 Klien
                    </label>
                    <input
                      id="muse-client-notes"
                      type="text"
                      value={museClientNotes}
                      onChange={(e) => setMuseClientNotes(e.target.value)}
                      placeholder="Contoh: Fokus sablon DTF & plastisol lusinan, warna hitam-kuning"
                      className="w-full px-3 py-2 clean-input rounded-lg text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="muse-ref-url" className="text-[11px] text-zinc-300 font-medium block">
                      URL Website Referensi Premium (Reverse Engineer UI)
                    </label>
                    <input
                      id="muse-ref-url"
                      type="url"
                      value={museReferenceUrl}
                      onChange={(e) => setMuseReferenceUrl(e.target.value)}
                      placeholder="Contoh: https://contoh-konveksi-premium.com"
                      className="w-full px-3 py-2 clean-input rounded-lg text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="muse-prompt-preview" className="text-[11px] text-zinc-400 font-medium">
                      Paket Prompt Bridge untuk Muse.ai (Siap Eksekusi)
                    </label>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        disabled={museAutoState.running}
                        onClick={async () => {
                          setMuseAutoState({
                            running: true,
                            jobId: '',
                            statusText: 'Mengirim brief ke antrean VM Muse.ai di background...',
                          });
                          try {
                            const res = await fetch('/api/ai/muse-queue', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                leadId: String(lead.id),
                                leadName: identity.cleanBrandName,
                                prompt: museBridgePrompt,
                              }),
                            });
                            const data = await res.json().catch(() => ({}));
                            if (!res.ok || !data.success) {
                              throw new Error(data.error || 'Gagal mengirim ke antrean Muse.ai.');
                            }
                            setMuseAutoState({
                              running: true,
                              jobId: data.jobId || '',
                              statusText:
                                'Antrean terkirim! Hook VM Muse.ai sedang memproses mockup di background (link akan terisi otomatis)...',
                            });
                          } catch (err) {
                            setMuseAutoState({
                              running: false,
                              jobId: '',
                              statusText: err?.message || 'Gagal memulai auto-bridge Muse.ai.',
                            });
                          }
                        }}
                        className="px-3 py-1 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-[11px] transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
                      >
                        {museAutoState.running && (
                          <span className="w-2.5 h-2.5 border-2 border-zinc-900/30 border-t-zinc-950 rounded-full animate-spin" />
                        )}
                        <span>
                          {museAutoState.running
                            ? 'Memproses di Background...'
                            : 'Generate Otomatis (Tanpa Buka Muse.ai)'}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={handleCopyMusePrompt}
                        className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 font-medium text-[11px] transition-colors"
                      >
                        {copiedMusePrompt ? 'Prompt Tersalin' : 'Salin Prompt'}
                      </button>
                    </div>
                  </div>
                  <textarea
                    id="muse-prompt-preview"
                    rows={5}
                    readOnly
                    value={museBridgePrompt}
                    className="w-full clean-input rounded-xl p-2.5 text-[11px] font-mono leading-relaxed resize-y bg-[#121215] text-zinc-300"
                  />
                </div>

                {museAutoState.statusText && (
                  <div
                    role="status"
                    className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-700 text-[11px] text-zinc-200 flex items-center justify-between gap-2"
                  >
                    <span>{museAutoState.statusText}</span>
                    {museAutoState.running && (
                      <button
                        type="button"
                        onClick={() =>
                          setMuseAutoState({ running: false, jobId: '', statusText: '' })
                        }
                        className="text-zinc-400 hover:text-white underline shrink-0"
                      >
                        Batal Pantau
                      </button>
                    )}
                  </div>
                )}

                <div className="pt-2 border-t border-zinc-800/80 space-y-2">
                  <div className="space-y-1">
                    <label htmlFor="muse-share-url" className="text-[11px] text-zinc-300 font-medium block">
                      Link Hasil Share Mockup Muse.ai (Tempel setelah selesai dibuat)
                    </label>
                    <input
                      id="muse-share-url"
                      type="url"
                      value={museShareUrl}
                      onChange={(e) => setMuseShareUrl(e.target.value)}
                      placeholder="https://muse.ai/s/mockup-landing-page-..."
                      className="w-full px-3 py-2 clean-input rounded-lg text-xs font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <span className="text-[11px] text-zinc-400 block">
                      Pesan Pengantar Link Mockup ke WA Klien (Chat 3):
                    </span>
                    <textarea
                      rows={3}
                      readOnly
                      value={mockupDeliveryText}
                      className="w-full clean-input rounded-xl p-2.5 text-xs leading-relaxed resize-none bg-[#121215]"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <>
                {activeTab === 'qualification' && (
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Kirim balasan ini saat klien menjawab <strong>&ldquo;Boleh&rdquo;</strong> pada Chat 1. Karena klien sudah membalas, link <code>https://kodekiri.tech</code> otomatis aktif bisa diklik di WhatsApp mereka, dan kita mengunci detail layanan/logo sebelum memakai kuota <code>muse.ai</code>.
                  </p>
                )}
                <textarea
                  rows={5}
                  value={currentMessage}
                  onChange={(e) => {
                    if (activeTab === 'qualification') setQualText(e.target.value);
                    else if (activeTab === 'followup') setFollowUpText(e.target.value);
                    else setPrimaryText(e.target.value);
                  }}
                  placeholder={
                    activeTab === 'followup'
                      ? 'Tulis atau hasilkan pesan follow-up singkat...'
                      : activeTab === 'qualification'
                        ? 'Tulis balasan kualifikasi saat klien menjawab Boleh...'
                        : 'Tulis atau hasilkan pesan penawaran WhatsApp...'
                  }
                  className="w-full clean-input rounded-xl p-3 text-xs leading-relaxed resize-y"
                />
              </>
            )}

            {research.modelUsed && (
              <div className="text-[11px] text-zinc-500 flex items-center justify-between gap-2">
                <span>Model: {research.modelUsed}</span>
                {research.analyzedAt && (
                  <span>
                    {new Date(research.analyzedAt).toLocaleDateString('id-ID', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                )}
              </div>
            )}
          </div>

          {saveNotice && (
            <div
              role="status"
              className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                saveNotice.type === 'success'
                  ? 'bg-emerald-950/40 border-emerald-900/70 text-emerald-200'
                  : 'bg-rose-950/40 border-rose-900/70 text-rose-200'
              }`}
            >
              <span>{saveNotice.text}</span>
              {saveNotice.type === 'error' && isDirty && (
                <button
                  type="button"
                  onClick={handleSaveEdits}
                  disabled={savingPitch}
                  className="px-2.5 py-1 rounded-md bg-rose-900/50 hover:bg-rose-900 text-rose-100 font-medium"
                >
                  Coba Lagi
                </button>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-3.5 border-t border-zinc-800 bg-[#0e0e11] flex items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCopy}
            disabled={!currentMessage}
            className="px-3.5 py-2 rounded-xl text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 transition-colors disabled:opacity-40"
          >
            {copied ? 'Berhasil Disalin' : 'Salin Pesan WA'}
          </button>

          {waDigits ? (
            <a
              href={`https://wa.me/${waDigits}?text=${encodeURIComponent(currentMessage || '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-zinc-100 hover:bg-white text-zinc-950 transition-colors shadow-sm inline-flex items-center gap-1.5"
            >
              <span>
                {activeTab === 'qualification'
                  ? 'Kirim Chat 2 ke WA'
                  : activeTab === 'muse'
                    ? 'Kirim Link Mockup ke WA'
                    : activeTab === 'followup'
                      ? 'Kirim Follow-up ke WA'
                      : 'Kirim Chat 1 ke WA'}
              </span>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </a>
          ) : (
            <span className="text-xs text-zinc-500">Nomor WA tidak tersedia</span>
          )}
        </div>
      </div>
    </div>
  );
}
