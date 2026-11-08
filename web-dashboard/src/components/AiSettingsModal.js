'use client';

import { useState, useEffect } from 'react';
import {
  DEEPSEEK_MODELS,
  DEFAULT_DEEPSEEK_MODEL,
  DEFAULT_OPENROUTER_MODEL,
  FALLBACK_FREE_MODELS,
  fetchFreeOpenRouterModels,
  testAiProviderConnection,
} from '@/lib/openrouter';

export default function AiSettingsModal({ settings, onClose, onSave }) {
  const [form, setForm] = useState(() => ({
    ...settings,
    deepseekApiKey: settings?.deepseekApiKey || '',
    openrouterApiKey: settings?.openrouterApiKey || '',
    clearDeepseekKey: false,
    clearOpenrouterKey: false,
  }));
  const [activeConfigTab, setActiveConfigTab] = useState(
    () => (['muse', 'deepseek', 'openrouter'].includes(settings?.primaryProvider) ? settings.primaryProvider : 'muse')
  );
  const [showDeepseekKey, setShowDeepseekKey] = useState(false);
  const [showOpenrouterKey, setShowOpenrouterKey] = useState(false);
  const [models, setModels] = useState(FALLBACK_FREE_MODELS);
  const [loadingModels, setLoadingModels] = useState(true);
  const [modelsNote, setModelsNote] = useState('');
  const [testingProvider, setTestingProvider] = useState(null); // 'deepseek' | 'openrouter' | null
  const [testResult, setTestResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    let cancelled = false;

    fetchFreeOpenRouterModels(settings?.openrouterApiKey || '').then((res) => {
      if (cancelled) return;
      setModels(res.models);
      setModelsNote(
        res.fromFallback
          ? 'Menggunakan daftar model gratis bawaan (fallback).'
          : `${res.models.length} model gratis aktif dimuat dari OpenRouter.`
      );
      setLoadingModels(false);
    });

    return () => {
      cancelled = true;
    };
  }, [settings?.openrouterApiKey]);

  const cloudDeepseekActive = Boolean(form.cloudDeepseekReady && !form.clearDeepseekKey);
  const cloudOpenrouterActive = Boolean(form.cloudOpenrouterReady && !form.clearOpenrouterKey);

  const hasDeepseekKey = Boolean(form.deepseekApiKey?.trim() || cloudDeepseekActive);
  const hasOpenrouterKey = Boolean(form.openrouterApiKey?.trim() || cloudOpenrouterActive);

  const handleRefreshModels = async () => {
    if (loadingModels) return;
    setLoadingModels(true);
    setModelsNote('');
    const res = await fetchFreeOpenRouterModels(form.openrouterApiKey);
    setModels(res.models);
    setModelsNote(
      res.fromFallback
        ? res.warning || 'Menggunakan daftar model gratis bawaan.'
        : `${res.models.length} model gratis terbaru berhasil dimuat.`
    );
    setLoadingModels(false);
  };

  const handleTest = async (provider) => {
    if (testingProvider || saving) return;
    setTestingProvider(provider);
    setTestResult(null);

    try {
      const testSettings = {
        ...form,
        cloudDeepseekReady: cloudDeepseekActive,
        cloudOpenrouterReady: cloudOpenrouterActive,
      };
      const res = await testAiProviderConnection(provider, testSettings);
      const label = provider === 'muse' ? 'Muse.ai (VM + Scrapling)' : provider === 'deepseek' ? 'DeepSeek' : 'OpenRouter Free';
      setTestResult({
        ok: true,
        provider,
        text: `${label} terhubung (${res.latencyMs} ms) memakai ${res.modelUsed}, sampel: ${res.qualification}.`,
      });
    } catch (err) {
      setTestResult({
        ok: false,
        provider,
        text: err?.message || `Gagal menguji koneksi ${provider}.`,
      });
    } finally {
      setTestingProvider(null);
    }
  };

  const handleSelectPrimary = (provider) => {
    setForm((prev) => ({ ...prev, primaryProvider: provider }));
    setActiveConfigTab(provider);
    setTestResult(null);
  };

  const executeCloudSave = async () => {
    if (saving) return;
    setSaving(true);
    setSaveError('');

    try {
      const res = await fetch('/api/ai/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryProvider: form.primaryProvider,
          autoFallback: form.autoFallback,
          deepseekApiKey: form.deepseekApiKey?.trim() || '',
          clearDeepseekKey: Boolean(form.clearDeepseekKey),
          deepseekModel: form.deepseekModel,
          openrouterApiKey: form.openrouterApiKey?.trim() || '',
          clearOpenrouterKey: Boolean(form.clearOpenrouterKey),
          openrouterModel: form.openrouterModel,
          agencyName: form.agencyName,
          serviceFocus: form.serviceFocus,
          pitchTone: form.pitchTone,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success || !data.settings) {
        throw new Error(data.error || `Gagal menyimpan ke database Neon (HTTP ${res.status}).`);
      }

      onSave(data.settings, { mode: 'cloud' });
    } catch (err) {
      setSaveError(
        err?.message || 'Tidak dapat menyimpan pengaturan ke Cloud Neon DB. Periksa koneksi database.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSaveLocalFallback = () => {
    onSave(form, { mode: 'local' });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    executeCloudSave();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div className="clean-card w-full sm:max-w-xl rounded-t-2xl sm:rounded-2xl max-h-[92dvh] flex flex-col shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800 flex items-start justify-between gap-3 shrink-0">
          <div>
            <h2 className="text-base font-bold text-white">
              Pengaturan Provider AI Bersama (Cloud Neon DB)
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              API Key disimpan terenkripsi ke Neon Postgres agar langsung aktif untuk seluruh rekan tim.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition-colors disabled:opacity-40"
            aria-label="Tutup modal pengaturan AI"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="p-5 space-y-4 overflow-y-auto text-xs flex-1">
            {/* 1. PRIMARY PROVIDER SELECTOR */}
            <div className="space-y-2">
              <span className="font-semibold text-zinc-300 uppercase tracking-wider text-[11px] block">
                1. Pilih Provider Utama (Default Eksekusi)
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => handleSelectPrimary('muse')}
                  className={`p-3 rounded-xl border text-left transition-colors ${
                    form.primaryProvider === 'muse'
                      ? 'bg-emerald-950/35 border-emerald-500/80'
                      : 'bg-[#18181b] border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-white text-xs">Muse.ai (VM)</span>
                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-emerald-300">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      {form.primaryProvider === 'muse' ? 'Utama' : 'Siap'}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-1">
                    Riset AI Masal, Scraping Lokasi Tanpa Web (Scrapling), &amp; Mockup Otomatis.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectPrimary('deepseek')}
                  className={`p-3 rounded-xl border text-left transition-colors ${
                    form.primaryProvider === 'deepseek'
                      ? 'bg-zinc-800/80 border-zinc-300'
                      : 'bg-[#18181b] border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-white text-xs">DeepSeek API</span>
                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-zinc-300">
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          hasDeepseekKey ? 'bg-emerald-400' : 'bg-zinc-500'
                        }`}
                      />
                      {form.primaryProvider === 'deepseek' ? 'Utama' : 'Cadangan'}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-1">
                    Cepat, JSON stabil (DeepSeek V3 / R1), dibagi otomatis lewat Cloud DB.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectPrimary('openrouter')}
                  className={`p-3 rounded-xl border text-left transition-colors ${
                    form.primaryProvider === 'openrouter'
                      ? 'bg-zinc-800/80 border-zinc-300'
                      : 'bg-[#18181b] border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-white text-xs">OpenRouter (Free)</span>
                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-zinc-300">
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          hasOpenrouterKey ? 'bg-emerald-400' : 'bg-zinc-500'
                        }`}
                      />
                      {form.primaryProvider === 'openrouter' ? 'Utama' : 'Cadangan'}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-1">
                    Khusus model gratis (:free), cocok sebagai cadangan nol biaya.
                  </p>
                </button>
              </div>

              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-[#18181b] border border-zinc-800/90 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(form.autoFallback)}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, autoFallback: e.target.checked }))
                  }
                  className="mt-0.5 rounded border-zinc-700 bg-zinc-900"
                />
                <div className="space-y-0.5">
                  <span className="text-zinc-200 font-medium block">
                    Aktifkan Auto-Fallback Pintar (Anti-Bentrok)
                  </span>
                  <span className="text-[11px] text-zinc-400 block leading-relaxed">
                    Jika keduanya tersimpan dan provider utama kehabisan saldo (402) atau terkena rate-limit (429), otomatis beralih ke provider cadangan.
                  </span>
                </div>
              </label>
            </div>

            {/* 2. ISOLATED CREDENTIAL TABS */}
            <div className="space-y-3 pt-2 border-t border-zinc-800/80">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-zinc-300 uppercase tracking-wider text-[11px]">
                  2. Input API Key &amp; Model per Provider
                </span>
                <div className="inline-flex p-0.5 rounded-lg bg-zinc-900 border border-zinc-800">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveConfigTab('muse');
                      setTestResult(null);
                    }}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors flex items-center gap-1.5 ${
                      activeConfigTab === 'muse'
                        ? 'bg-zinc-100 text-zinc-950 font-semibold'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span>Tab Muse.ai</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveConfigTab('deepseek');
                      setTestResult(null);
                    }}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors flex items-center gap-1.5 ${
                      activeConfigTab === 'deepseek'
                        ? 'bg-zinc-100 text-zinc-950 font-semibold'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        hasDeepseekKey ? 'bg-emerald-500' : 'bg-zinc-500'
                      }`}
                    />
                    <span>Tab DeepSeek</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveConfigTab('openrouter');
                      setTestResult(null);
                    }}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors flex items-center gap-1.5 ${
                      activeConfigTab === 'openrouter'
                        ? 'bg-zinc-100 text-zinc-950 font-semibold'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        hasOpenrouterKey ? 'bg-emerald-500' : 'bg-zinc-500'
                      }`}
                    />
                    <span>Tab OpenRouter Free</span>
                  </button>
                </div>
              </div>

              {activeConfigTab === 'muse' ? (
                <div className="p-3.5 rounded-xl bg-[#18181b] border border-zinc-800 space-y-3">
                  <div className="p-2.5 rounded-lg bg-emerald-950/35 border border-emerald-900/70 flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-emerald-200">
                      Bridge VM <code className="font-mono text-emerald-100">muse.ai/vm-scrapling</code> aktif (SSH + 16 Agent Skills terhubung).
                    </span>
                    <span className="px-2 py-0.5 rounded bg-emerald-900/50 text-emerald-100 font-semibold shrink-0">
                      Tanpa API Key Eksternal
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Saat <strong>Muse.ai (VM)</strong> dipilih sebagai provider utama, tombol <strong>Scrape Lokasi (Muse.ai)</strong>, <strong>Riset AI Masal</strong>, dan <strong>Generate Mockup Otomatis</strong> langsung dieksekusi menggunakan engine Muse.ai + Scrapling tanpa memerlukan saldo DeepSeek maupun OpenRouter.
                  </p>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-zinc-500">
                      Model aktif: <code className="font-mono text-zinc-300">muse.ai/vm-scrapling</code>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleTest('muse')}
                      disabled={Boolean(testingProvider)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 transition-colors disabled:opacity-40 inline-flex items-center gap-1.5 shrink-0"
                    >
                      {testingProvider === 'muse' && (
                        <span className="w-3 h-3 border-2 border-zinc-400/30 border-t-white rounded-full animate-spin" />
                      )}
                      <span>
                        {testingProvider === 'muse' ? 'Menguji...' : 'Tes Muse.ai'}
                      </span>
                    </button>
                  </div>
                </div>
              ) : activeConfigTab === 'deepseek' ? (
                <div className="p-3.5 rounded-xl bg-[#18181b] border border-zinc-800 space-y-3">
                  {cloudDeepseekActive && !form.deepseekApiKey && (
                    <div className="p-2.5 rounded-lg bg-emerald-950/35 border border-emerald-900/70 flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-emerald-200">
                        Key aktif di Cloud Neon:{' '}
                        <code className="font-mono text-emerald-100">
                          {form.cloudDeepseekMask || 'Tersimpan'}
                        </code>
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            clearDeepseekKey: true,
                            deepseekApiKey: '',
                          }))
                        }
                        className="px-2 py-0.5 rounded bg-zinc-900 hover:bg-rose-950/70 text-zinc-300 hover:text-rose-200 border border-zinc-700 transition-colors shrink-0"
                      >
                        Hapus dari Cloud
                      </button>
                    </div>
                  )}

                  {form.clearDeepseekKey && !form.deepseekApiKey && (
                    <div className="p-2.5 rounded-lg bg-amber-950/35 border border-amber-900/70 flex items-center justify-between gap-2 text-[11px] text-amber-200">
                      <span>Key DeepSeek di Cloud akan dihapus saat Anda menekan Simpan.</span>
                      <button
                        type="button"
                        onClick={() => setForm((prev) => ({ ...prev, clearDeepseekKey: false }))}
                        className="underline hover:text-white shrink-0"
                      >
                        Urungkan
                      </button>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <label htmlFor="ds-api-key" className="font-medium text-zinc-200">
                        {cloudDeepseekActive ? 'Ganti DeepSeek API Key (Opsional)' : 'DeepSeek API Key'}
                      </label>
                      <a
                        href="https://platform.deepseek.com/api_keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-zinc-400 hover:text-white underline underline-offset-2"
                      >
                        Buka Dashboard DeepSeek
                      </a>
                    </div>
                    <div className="relative">
                      <input
                        id="ds-api-key"
                        type={showDeepseekKey ? 'text' : 'password'}
                        value={form.deepseekApiKey || ''}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            deepseekApiKey: e.target.value,
                            clearDeepseekKey: false,
                          }))
                        }
                        placeholder={
                          cloudDeepseekActive
                            ? 'Kosongkan untuk tetap memakai key Cloud saat ini...'
                            : 'sk-...'
                        }
                        className="w-full px-3.5 py-2.5 pr-28 clean-input rounded-xl font-mono text-xs bg-[#121215]"
                      />
                      <div className="absolute inset-y-0 right-0 flex items-center pr-2 gap-1">
                        {form.deepseekApiKey && (
                          <button
                            type="button"
                            onClick={() =>
                              setForm((prev) => ({ ...prev, deepseekApiKey: '' }))
                            }
                            className="px-2 py-1 text-[11px] text-zinc-500 hover:text-rose-300"
                          >
                            Bersihkan
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setShowDeepseekKey((prev) => !prev)}
                          className="px-2 py-1 text-[11px] font-medium text-zinc-400 hover:text-white"
                        >
                          {showDeepseekKey ? 'Sembunyi' : 'Lihat'}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="ds-model" className="font-medium text-zinc-200 block">
                      Model DeepSeek
                    </label>
                    <select
                      id="ds-model"
                      value={form.deepseekModel || DEFAULT_DEEPSEEK_MODEL}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, deepseekModel: e.target.value }))
                      }
                      className="w-full px-3 py-2 clean-input rounded-xl text-xs bg-[#121215]"
                    >
                      {DEEPSEEK_MODELS.map((m) => (
                        <option key={m.id} value={m.id} className="bg-[#121215] text-zinc-100">
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-zinc-500">
                      Diproses via server terautentikasi dan terenkripsi di Neon DB.
                    </span>
                    <button
                      type="button"
                      onClick={() => handleTest('deepseek')}
                      disabled={Boolean(testingProvider) || !hasDeepseekKey}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 transition-colors disabled:opacity-40 inline-flex items-center gap-1.5 shrink-0"
                    >
                      {testingProvider === 'deepseek' && (
                        <span className="w-3 h-3 border-2 border-zinc-400/30 border-t-white rounded-full animate-spin" />
                      )}
                      <span>
                        {testingProvider === 'deepseek' ? 'Menguji...' : 'Tes DeepSeek'}
                      </span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-[#18181b] border border-zinc-800 space-y-3">
                  {cloudOpenrouterActive && !form.openrouterApiKey && (
                    <div className="p-2.5 rounded-lg bg-emerald-950/35 border border-emerald-900/70 flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-emerald-200">
                        Key aktif di Cloud Neon:{' '}
                        <code className="font-mono text-emerald-100">
                          {form.cloudOpenrouterMask || 'Tersimpan'}
                        </code>
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            clearOpenrouterKey: true,
                            openrouterApiKey: '',
                          }))
                        }
                        className="px-2 py-0.5 rounded bg-zinc-900 hover:bg-rose-950/70 text-zinc-300 hover:text-rose-200 border border-zinc-700 transition-colors shrink-0"
                      >
                        Hapus dari Cloud
                      </button>
                    </div>
                  )}

                  {form.clearOpenrouterKey && !form.openrouterApiKey && (
                    <div className="p-2.5 rounded-lg bg-amber-950/35 border border-amber-900/70 flex items-center justify-between gap-2 text-[11px] text-amber-200">
                      <span>Key OpenRouter di Cloud akan dihapus saat Anda menekan Simpan.</span>
                      <button
                        type="button"
                        onClick={() => setForm((prev) => ({ ...prev, clearOpenrouterKey: false }))}
                        className="underline hover:text-white shrink-0"
                      >
                        Urungkan
                      </button>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <label htmlFor="or-api-key" className="font-medium text-zinc-200">
                        {cloudOpenrouterActive
                          ? 'Ganti OpenRouter API Key (Opsional)'
                          : 'OpenRouter API Key'}
                      </label>
                      <a
                        href="https://openrouter.ai/settings/keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-zinc-400 hover:text-white underline underline-offset-2"
                      >
                        Ambil Key Gratis OpenRouter
                      </a>
                    </div>
                    <div className="relative">
                      <input
                        id="or-api-key"
                        type={showOpenrouterKey ? 'text' : 'password'}
                        value={form.openrouterApiKey || ''}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            openrouterApiKey: e.target.value,
                            clearOpenrouterKey: false,
                          }))
                        }
                        placeholder={
                          cloudOpenrouterActive
                            ? 'Kosongkan untuk tetap memakai key Cloud saat ini...'
                            : 'sk-or-v1-...'
                        }
                        className="w-full px-3.5 py-2.5 pr-28 clean-input rounded-xl font-mono text-xs bg-[#121215]"
                      />
                      <div className="absolute inset-y-0 right-0 flex items-center pr-2 gap-1">
                        {form.openrouterApiKey && (
                          <button
                            type="button"
                            onClick={() =>
                              setForm((prev) => ({ ...prev, openrouterApiKey: '' }))
                            }
                            className="px-2 py-1 text-[11px] text-zinc-500 hover:text-rose-300"
                          >
                            Bersihkan
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setShowOpenrouterKey((prev) => !prev)}
                          className="px-2 py-1 text-[11px] font-medium text-zinc-400 hover:text-white"
                        >
                          {showOpenrouterKey ? 'Sembunyi' : 'Lihat'}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <label htmlFor="or-model" className="font-medium text-zinc-200">
                        Model Gratis (:free)
                      </label>
                      <button
                        type="button"
                        onClick={handleRefreshModels}
                        disabled={loadingModels}
                        className="text-[11px] text-zinc-400 hover:text-white disabled:opacity-50"
                      >
                        {loadingModels ? 'Memuat...' : 'Segarkan Daftar'}
                      </button>
                    </div>
                    <select
                      id="or-model"
                      value={form.openrouterModel || DEFAULT_OPENROUTER_MODEL}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, openrouterModel: e.target.value }))
                      }
                      className="w-full px-3 py-2 clean-input rounded-xl text-xs bg-[#121215]"
                    >
                      {models.map((m) => (
                        <option key={m.id} value={m.id} className="bg-[#121215] text-zinc-100">
                          {m.name} {m.id !== DEFAULT_OPENROUTER_MODEL ? `(${m.id})` : ''}
                        </option>
                      ))}
                    </select>
                    {modelsNote && <p className="text-[11px] text-zinc-500">{modelsNote}</p>}
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-zinc-500">
                      Hanya memfilter model bertarif Rp 0 (:free).
                    </span>
                    <button
                      type="button"
                      onClick={() => handleTest('openrouter')}
                      disabled={Boolean(testingProvider) || !hasOpenrouterKey}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 transition-colors disabled:opacity-40 inline-flex items-center gap-1.5 shrink-0"
                    >
                      {testingProvider === 'openrouter' && (
                        <span className="w-3 h-3 border-2 border-zinc-400/30 border-t-white rounded-full animate-spin" />
                      )}
                      <span>
                        {testingProvider === 'openrouter' ? 'Menguji...' : 'Tes OpenRouter'}
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {testResult && (
              <div
                role="status"
                className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                  testResult.ok
                    ? 'bg-emerald-950/40 border-emerald-900/70 text-emerald-200'
                    : 'bg-rose-950/40 border-rose-900/70 text-rose-200'
                }`}
              >
                <span className="leading-relaxed">{testResult.text}</span>
                {!testResult.ok && (
                  <button
                    type="button"
                    onClick={() => handleTest(testResult.provider)}
                    disabled={Boolean(testingProvider)}
                    className="shrink-0 px-2.5 py-1 rounded-md bg-rose-900/50 hover:bg-rose-900 text-rose-100 font-medium"
                  >
                    Ulangi
                  </button>
                )}
              </div>
            )}

            {/* 3. AGENCY PROFILE */}
            <div className="pt-2 border-t border-zinc-800/80 space-y-3">
              <div className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider">
                3. Personalisasi Penawaran Agensi / Freelancer
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="agency-name" className="text-[11px] text-zinc-400 block">
                    Nama Tim / Pengirim
                  </label>
                  <input
                    id="agency-name"
                    type="text"
                    value={form.agencyName || ''}
                    onChange={(e) => setForm((prev) => ({ ...prev, agencyName: e.target.value }))}
                    placeholder="Misal: Tim Developer KodeKiri"
                    className="w-full px-3 py-2 clean-input rounded-lg text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="pitch-tone" className="text-[11px] text-zinc-400 block">
                    Gaya Bahasa Pesan WA
                  </label>
                  <select
                    id="pitch-tone"
                    value={form.pitchTone || 'casual'}
                    onChange={(e) => setForm((prev) => ({ ...prev, pitchTone: e.target.value }))}
                    className="w-full px-3 py-2 clean-input rounded-lg text-xs bg-[#18181b]"
                  >
                    <option value="casual" className="bg-[#18181b]">Santai &amp; Natural WA</option>
                    <option value="consultative" className="bg-[#18181b]">Konsultatif Berbasis Data</option>
                    <option value="formal" className="bg-[#18181b]">Formal &amp; Sopan B2B</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label htmlFor="service-focus" className="text-[11px] text-zinc-400 block">
                  Fokus Layanan yang Ditawarkan
                </label>
                <input
                  id="service-focus"
                  type="text"
                  value={form.serviceFocus || ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, serviceFocus: e.target.value }))}
                  placeholder="Misal: Pembuatan Website Katalog Mandiri & Landing Page SEO"
                  className="w-full px-3 py-2 clean-input rounded-lg text-xs"
                />
              </div>
            </div>

            {saveError && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-rose-950/40 border border-rose-900/70 text-rose-200 space-y-2"
              >
                <p className="leading-relaxed">{saveError}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={executeCloudSave}
                    disabled={saving}
                    className="px-3 py-1 rounded-lg bg-rose-900/60 hover:bg-rose-900 text-rose-100 font-semibold transition-colors"
                  >
                    Coba Simpan Cloud Lagi
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveLocalFallback}
                    className="px-3 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 font-medium transition-colors"
                  >
                    Simpan di Browser Ini Saja (Fallback)
                  </button>
                </div>
              </div>
            )}

            {/* 4. STORAGE LOCATION EXPLANATION */}
            <div className="p-3 rounded-xl bg-zinc-900/70 border border-zinc-800/80 text-[11px] text-zinc-400 leading-relaxed">
              <strong className="text-zinc-200">Sinkronisasi Tim Otomatis:</strong> Begitu salah satu rekan tim menyimpan API Key di sini, key dienkripsi dengan AES-256-GCM ke tabel <code className="text-zinc-300">AppSetting</code> di Neon Postgres sehingga perangkat lain yang login otomatis siap menjalankan analisis tanpa perlu input ulang.
            </div>
          </div>

          <div className="px-5 py-3.5 border-t border-zinc-800 bg-[#0e0e11] flex items-center justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-3.5 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-white transition-colors disabled:opacity-40"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-zinc-100 hover:bg-white text-zinc-950 transition-colors shadow-sm disabled:opacity-40 inline-flex items-center gap-2"
            >
              {saving && (
                <span className="w-3 h-3 border-2 border-zinc-600/40 border-t-zinc-950 rounded-full animate-spin" />
              )}
              <span>{saving ? 'Menyimpan ke Cloud...' : 'Simpan ke Cloud DB'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
