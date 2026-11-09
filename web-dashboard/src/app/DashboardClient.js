'use client';

import { useState, useMemo, useRef, useCallback, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  DEFAULT_OPENROUTER_MODEL,
  analyzeLeadWithAi,
  buildDefaultWaPitch,
  isAnyAiConfigured,
  resolveActiveProvider,
  loadAiSettings,
  saveAiSettings,
  mergeCloudAndLocalAiSettings,
  subscribeAiSettings,
  getServerAiSettingsSnapshot,
} from '@/lib/openrouter';
import {
  evaluateLeadQualification,
  groupDeleteRecommendations,
} from '@/lib/leadQualification';
import {
  PIPELINE_STAGES,
  deriveLeadPipelineStage,
} from '@/lib/automationEngine';
import SectionErrorBoundary from '@/components/SectionErrorBoundary';
import AutomationCommandBar from '@/components/AutomationCommandBar';
import AiSettingsModal from '@/components/AiSettingsModal';
import AiLeadModal from '@/components/AiLeadModal';
import CleanupRecommendationsModal from '@/components/CleanupRecommendationsModal';
import ExtensionGuideModal from '@/components/ExtensionGuideModal';

const PAGE_SIZE = 25;

function getSocialLabel(url) {
  const lower = (url || '').toLowerCase();
  if (lower.includes('instagram.com') || lower.includes('instagr.am')) return 'Instagram';
  if (lower.includes('tiktok.com')) return 'TikTok';
  if (lower.includes('facebook.com') || lower.includes('fb.')) return 'Facebook';
  if (lower.includes('linktr.ee') || lower.includes('lynk.id') || lower.includes('s.id')) return 'Bio Link';
  return 'Sosmed';
}

function getShopLabel(url) {
  const lower = (url || '').toLowerCase();
  if (lower.includes('shopee.') || lower.includes('shope.ee') || lower.includes('shp.ee')) return 'Shopee';
  if (lower.includes('tokopedia.') || lower.includes('tkp.me')) return 'Tokopedia';
  if (lower.includes('lazada.') || lower.includes('lzd.co')) return 'Lazada';
  if (lower.includes('gofood.') || lower.includes('grab.com')) return 'Food App';
  return 'Olshop';
}

function formatScrapedAt(rawDate) {
  if (!rawDate) return '-';
  try {
    const d = new Date(rawDate);
    if (isNaN(d.getTime())) return String(rawDate);
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d).replace(/\./g, ':');
  } catch {
    return String(rawDate);
  }
}

function formatTimeOnly(rawDate) {
  if (!rawDate) return '';
  try {
    const d = new Date(rawDate);
    if (isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d).replace(/\./g, ':');
  } catch {
    return '';
  }
}

function getQualificationStyles(qual = '') {
  if (qual.includes('HOT')) {
    return {
      pill: 'bg-rose-950/50 text-rose-200 border-rose-900/70 hover:border-rose-700',
      dot: 'bg-rose-400',
    };
  }
  if (qual.includes('COLD')) {
    return {
      pill: 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-700',
      dot: 'bg-zinc-500',
    };
  }
  return {
    pill: 'bg-amber-950/40 text-amber-200 border-amber-900/70 hover:border-amber-700',
    dot: 'bg-amber-400',
  };
}

export default function DashboardClient({
  initialLeads = [],
  initialCloudAiSettings = null,
}) {
  const router = useRouter();
  const [leads, setLeads] = useState(initialLeads);
  const [cloudAiSettings, setCloudAiSettings] = useState(initialCloudAiSettings);

  // Filter & pagination states
  const [searchQuery, setSearchQuery] = useState('');
  const [viabilityFilter, setViabilityFilter] = useState('ALL'); // 'ALL' | 'ELIGIBLE' | 'RECOMMEND_DELETE'
  const [websiteFilter, setWebsiteFilter] = useState('ALL'); // 'ALL' | 'NO_WEB' | 'HAS_WEB'
  const [ratingFilter, setRatingFilter] = useState('ALL'); // 'ALL' | '4.5' | '4.0'
  const [channelFilter, setChannelFilter] = useState('ALL'); // 'ALL' | 'HAS_WA' | 'HAS_SHOP' | 'HAS_SOCIAL'
  const [aiFilter, setAiFilter] = useState('ALL'); // 'ALL' | 'HOT' | 'WARM' | 'COLD' | 'UNRESEARCHED'
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [chatFilter, setChatFilter] = useState('ALL'); // 'ALL' | 'UNCONTACTED' | 'CONTACTED'
  const [pipelineFilter, setPipelineFilter] = useState('ALL');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [pageState, setPageState] = useState({ page: 1, filterKey: '' });

  // Modals & settings
  const localAiSettings = useSyncExternalStore(
    subscribeAiSettings,
    loadAiSettings,
    getServerAiSettingsSnapshot
  );
  const aiSettings = useMemo(
    () => mergeCloudAndLocalAiSettings(cloudAiSettings, localAiSettings),
    [cloudAiSettings, localAiSettings]
  );

  const [showAiSettingsModal, setShowAiSettingsModal] = useState(false);
  const [showCleanupModal, setShowCleanupModal] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState(null);
  const [showExtensionModal, setShowExtensionModal] = useState(false);

  // Action feedback & mutation tracking
  const [analyzingIds, setAnalyzingIds] = useState([]);
  const [deletingIds, setDeletingIds] = useState([]);
  const [deletingAll, setDeletingAll] = useState(false);
  const [unsyncedAiMap, setUnsyncedAiMap] = useState({});
  const [notice, setNotice] = useState(null);
  const [bulkState, setBulkState] = useState({
    running: false,
    done: 0,
    total: 0,
    currentName: '',
    note: '',
  });
  const bulkAbortRef = useRef(null);

  const normalizeWa = useCallback((phone, geoScope = '') => {
    if (!phone) return '';
    const clean = String(phone).trim();
    if (clean.startsWith('+')) {
      return clean.replace(/[^\d]/g, '');
    }
    let digits = clean.replace(/[^\d]/g, '');
    if (!digits) return '';
    if (digits.startsWith('0')) return '62' + digits.slice(1);
    if (digits.startsWith('62')) return digits;
    if (geoScope === 'INTERNATIONAL' && digits.length >= 8) return digits;
    if (digits.startsWith('8') && digits.length >= 9) return '62' + digits;
    return digits;
  }, []);

  // Precompute rule-based qualification for every lead (0 AI tokens)
  const evaluationById = useMemo(() => {
    const map = new Map();
    for (const lead of leads) {
      map.set(String(lead.id), evaluateLeadQualification(lead));
    }
    return map;
  }, [leads]);

  const cleanupSummary = useMemo(() => groupDeleteRecommendations(leads), [leads]);
  const eligibleCount = leads.length - cleanupSummary.totalFlagged;

  const selectedAiLead = useMemo(() => {
    if (selectedLeadId === null) return null;
    return leads.find((l) => String(l.id) === String(selectedLeadId)) || null;
  }, [leads, selectedLeadId]);

  const filteredLeads = useMemo(() => {
    const result = leads.filter((lead) => {
      const evalInfo = evaluationById.get(String(lead.id)) || evaluateLeadQualification(lead);

      if (viabilityFilter === 'ELIGIBLE' && evalInfo.recommendDelete) return false;
      if (viabilityFilter === 'RECOMMEND_DELETE' && !evalInfo.recommendDelete) return false;

      const hasOwnedWeb = evalInfo.websiteType === 'OWNED_DOMAIN' || lead.websiteStatus === 'has_website';
      if (websiteFilter === 'NO_WEB' && hasOwnedWeb) return false;
      if (websiteFilter === 'HAS_WEB' && !hasOwnedWeb) return false;
      if (websiteFilter === 'SOCIAL_ONLY' && lead.websiteStatus !== 'social_only' && !lead.socialMedia && !lead.onlineShop) return false;
      if (websiteFilter === 'DEAD_WEB' && lead.websiteStatus !== 'website_dead' && !lead.deadWebsiteUrl) return false;

      const rVal = parseFloat((lead.rating || '').toString().replace(',', '.'));
      if (ratingFilter === '4.5' && (Number.isNaN(rVal) || rVal < 4.5)) return false;
      if (ratingFilter === '4.0' && (Number.isNaN(rVal) || rVal < 4.0)) return false;

      const hasWa = Boolean(lead.whatsapp || lead.phone);
      const hasShop = Boolean(lead.onlineShop);
      const hasSocial = Boolean(lead.socialMedia);
      if (channelFilter === 'HAS_WA' && !hasWa) return false;
      if (channelFilter === 'HAS_SHOP' && !hasShop) return false;
      if (channelFilter === 'HAS_SOCIAL' && !hasSocial) return false;

      const qual = lead.aiResearch?.leadQualification || '';
      if (aiFilter === 'HOT' && !qual.includes('HOT')) return false;
      if (aiFilter === 'WARM' && !qual.includes('WARM')) return false;
      if (aiFilter === 'COLD' && !qual.includes('COLD')) return false;
      if (aiFilter === 'UNRESEARCHED' && lead.aiResearch) return false;

      if (chatFilter === 'UNCONTACTED' && lead.chatStatus === 'SUDAH') return false;
      if (chatFilter === 'CONTACTED' && lead.chatStatus !== 'SUDAH') return false;

      if (pipelineFilter !== 'ALL') {
        const leadStage = deriveLeadPipelineStage(lead);
        if (leadStage !== pipelineFilter) return false;
      }

      const leadCat = lead.categoryName || 'Tanpa Kategori';
      if (categoryFilter !== 'ALL' && leadCat !== categoryFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const haystacks = [
          lead.name,
          lead.address,
          lead.phone,
          lead.whatsapp,
          leadCat,
          lead.socialMedia,
          lead.onlineShop,
          evalInfo.shortLabel,
        ];
        const matched = haystacks.some((val) => (val || '').toLowerCase().includes(q));
        if (!matched) return false;
      }

      return true;
    });

    return result.sort((a, b) => {
      const timeA = a.scrapedAt ? new Date(a.scrapedAt).getTime() : 0;
      const timeB = b.scrapedAt ? new Date(b.scrapedAt).getTime() : 0;
      if (!isNaN(timeA) && !isNaN(timeB) && timeB !== timeA) {
        return timeB - timeA;
      }
      return Number(b.id || 0) - Number(a.id || 0);
    });
  }, [leads,
    evaluationById,
    viabilityFilter,
    searchQuery,
    websiteFilter,
    ratingFilter,
    channelFilter,
    aiFilter,
    categoryFilter,
    chatFilter,
    pipelineFilter]);

  const filterKey = `${viabilityFilter}|${searchQuery}|${websiteFilter}|${ratingFilter}|${channelFilter}|${aiFilter}|${categoryFilter}|${chatFilter}|${pipelineFilter}`;
  const totalPages = Math.max(1, Math.ceil(filteredLeads.length / PAGE_SIZE));
  const activePage = pageState.filterKey === filterKey ? pageState.page : 1;
  const safePage = Math.min(activePage, totalPages);
  const setCurrentPage = (updater) => {
    setPageState((prev) => {
      const base = prev.filterKey === filterKey ? prev.page : 1;
      const next = typeof updater === 'function' ? updater(base) : updater;
      return { page: next, filterKey };
    });
  };
  const paginatedLeads = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredLeads.slice(start, start + PAGE_SIZE);
  }, [filteredLeads, safePage]);

  const activeFilterCount = [
    viabilityFilter !== 'ALL',
    websiteFilter !== 'ALL',
    ratingFilter !== 'ALL',
    channelFilter !== 'ALL',
    aiFilter !== 'ALL',
    categoryFilter !== 'ALL',
    chatFilter !== 'ALL',
    pipelineFilter !== 'ALL',
  ].filter(Boolean).length;

  const hasActiveFilters = searchQuery.trim() !== '' || activeFilterCount > 0;

  const resetAllFilters = () => {
    setSearchQuery('');
    setViabilityFilter('ALL');
    setWebsiteFilter('ALL');
    setRatingFilter('ALL');
    setChannelFilter('ALL');
    setAiFilter('ALL');
    setCategoryFilter('ALL');
    setChatFilter('ALL');
    setPipelineFilter('ALL');
  };

  const stageCounts = useMemo(() => {
    const counts = {
      QUEUED: 0,
      CHAT1_SENT: 0,
      QUALIFYING: 0,
      MOCKUP_SENT: 0,
      HANDOVER_TO_HUMAN: 0,
      DECLINED: 0,
    };
    for (const l of leads) {
      const st = deriveLeadPipelineStage(l);
      counts[st] = (counts[st] || 0) + 1;
    }
    return counts;
  }, [leads]);

  const handleRunDryRunSimulation = async (refreshCommandBar) => {
    const isSimulatable = (l) => {
      if (!l) return false;
      const ev = evaluationById.get(String(l.id)) || evaluateLeadQualification(l);
      if (ev.recommendDelete || !ev.hasMobileWa) return false;
      if (l.aiResearch?.botPaused) return false;
      const st = deriveLeadPipelineStage(l);
      return st !== 'HANDOVER_TO_HUMAN' && st !== 'DECLINED';
    };

    const candidate =
      leads.find((l) => isSimulatable(l) && deriveLeadPipelineStage(l) === 'QUEUED') ||
      leads.find((l) => isSimulatable(l) && deriveLeadPipelineStage(l) === 'CHAT1_SENT') ||
      leads.find((l) => isSimulatable(l) && deriveLeadPipelineStage(l) === 'QUALIFYING') ||
      leads.find((l) => isSimulatable(l) && deriveLeadPipelineStage(l) === 'MOCKUP_SENT') ||
      null;

    if (!candidate) {
      setNotice({
        type: 'info',
        text: 'Seluruh prospek layak saat ini sudah berada di tahap Siap Closing (Diambil Alih Tim) atau Bot Pause. Tidak ada pesan otomatis tambahan yang dikirim.',
      });
      return;
    }

    const currentStage = deriveLeadPipelineStage(candidate);
    let nextStage = 'CHAT1_SENT';
    let simulatedReply = '';
    let summaryText = '';

    if (currentStage === 'QUEUED') {
      nextStage = 'CHAT1_SENT';
      summaryText = `[SIMULASI UAT - Chat 1] Mengirim Chat 1 Pembuka ke "${candidate.name.split('|')[0].trim()}" (Status: Chat 1 Terkirim).`;
    } else if (currentStage === 'CHAT1_SENT') {
      nextStage = 'QUALIFYING';
      simulatedReply = 'Boleh kak liat contoh tampilannya';
      summaryText = `[SIMULASI UAT - Chat 2] "${candidate.name.split('|')[0].trim()}" membalas "Boleh" -> Bot membalas Chat 2 (https://kodekiri.tech + tanya layanan/logo).`;
    } else if (currentStage === 'QUALIFYING') {
      nextStage = 'MOCKUP_SENT';
      simulatedReply = 'Kami fokus sablon DTF & plastisol lusinan kak';
      summaryText = `[SIMULASI UAT - Mockup] "${candidate.name.split('|')[0].trim()}" mengirim detail layanan -> Mockup 4-Section dibuat & dikirim ke WA klien.`;
    } else {
      nextStage = 'HANDOVER_TO_HUMAN';
      simulatedReply = 'Tampilannya cocok kak, kalau lanjut domain resmi berapa harganya?';
      summaryText = `[SIMULASI UAT - HANDOVER TIM] "${candidate.name.split('|')[0].trim()}" menanyakan harga resmi! Bot di-pause otomatis agar Tim Developer KodeKiri mengambil alih closing.`;
    }

    const updatedResearch = {
      ...(candidate.aiResearch || {}),
      pipelineStage: nextStage,
      botPaused: nextStage === 'HANDOVER_TO_HUMAN',
      lastClientReply: simulatedReply || candidate.aiResearch?.lastClientReply || '',
    };

    setLeads((prev) =>
      prev.map((item) =>
        String(item.id) === String(candidate.id)
          ? {
              ...item,
              chatStatus: 'SUDAH',
              contactedAt: item.contactedAt || new Date().toISOString(),
              aiResearch: updatedResearch,
            }
          : item
      )
    );

    try {
      await persistAiToDb(candidate.id, updatedResearch);
    } catch {
      // Ignore offline DB error in local UAT
    }

    try {
      await fetch('/api/automation/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'LOG_EVENT',
          type: nextStage === 'HANDOVER_TO_HUMAN' ? 'warning' : 'success',
          incrementSent: false,
          message: summaryText,
        }),
      });
      if (refreshCommandBar) refreshCommandBar();
    } catch {
      // Ignore log error
    }

    setNotice({
      type: nextStage === 'HANDOVER_TO_HUMAN' ? 'warning' : 'success',
      text: summaryText,
    });
  };

  const categoryCounts = useMemo(() => {
    const counts = {};
    leads.forEach((l) => {
      const cat = l.categoryName || 'Tanpa Kategori';
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return counts;
  }, [leads]);

  const availableCategories = useMemo(
    () => Object.keys(categoryCounts).sort(),
    [categoryCounts]
  );

  // KPI metrics
  const totalLeads = leads.length;
  const filteredCount = filteredLeads.length;
  const noWebsiteCount = useMemo(
    () =>
      leads.filter((l) => {
        const ev = evaluationById.get(String(l.id));
        return ev ? ev.websiteType !== 'OWNED_DOMAIN' : !l.website;
      }).length,
    [leads, evaluationById]
  );
  const hotLeadsCount = useMemo(
    () => leads.filter((l) => l.aiResearch?.leadQualification?.includes('HOT')).length,
    [leads]
  );
  const researchedCount = useMemo(() => leads.filter((l) => Boolean(l.aiResearch)).length, [leads]);
  const chatContactedCount = useMemo(
    () => leads.filter((l) => l.chatStatus === 'SUDAH').length,
    [leads]
  );
  const chatUncontactedCount = useMemo(
    () => leads.filter((l) => l.chatStatus !== 'SUDAH').length,
    [leads]
  );

  // Bulk AI queue automatically skips leads flagged for deletion to save tokens
  const eligibleInFilter = useMemo(
    () =>
      filteredLeads.filter((l) => {
        const ev = evaluationById.get(String(l.id));
        return !ev?.recommendDelete;
      }),
    [filteredLeads, evaluationById]
  );

  const eligibleUnresearchedInFilter = useMemo(
    () => eligibleInFilter.filter((l) => !l.aiResearch),
    [eligibleInFilter]
  );

    const toggleChatStatus = useCallback(async (lead, forcedStatus = null) => {
    const nextStatus = forcedStatus || (lead.chatStatus === 'SUDAH' ? 'BELUM' : 'SUDAH');
    const nextContactedAt = nextStatus === 'SUDAH' ? new Date().toISOString() : null;

    setLeads((prev) =>
      prev.map((l) =>
        String(l.id) === String(lead.id)
          ? { ...l, chatStatus: nextStatus, contactedAt: nextContactedAt }
          : l
      )
    );

    try {
      const res = await fetch('/api/leads/chat-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: lead.id,
          chatStatus: nextStatus,
          contactedAt: nextContactedAt,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setNotice({
        type: 'success',
        text:
          nextStatus === 'SUDAH'
            ? `"${lead.name}" ditandai: Selesai (Sudah Dichat).`
            : `Status chat "${lead.name}" direset ke Belum Dichat.`,
      });
    } catch (err) {
      console.error('Update chat status failed:', err);
      setLeads((prev) =>
        prev.map((l) => (String(l.id) === String(lead.id) ? lead : l))
      );
      setNotice({
        type: 'error',
        text: err.message || 'Gagal mengubah status chat.',
      });
    }
  }, []);

  const handleOpenChat = useCallback(
    (lead, waUrl) => {
      if (waUrl) {
        window.open(waUrl, '_blank', 'noopener,noreferrer');
      }
      if (lead.chatStatus !== 'SUDAH') {
        toggleChatStatus(lead, 'SUDAH');
      }
    },
    [toggleChatStatus]
  );

  const persistAiToDb = useCallback(async (id, aiResearch) => {
    const res = await fetch('/api/leads/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, aiResearch }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data.aiResearch || aiResearch;
  }, []);

  async function retryUnsyncedDbSaves(overrideMap) {
    const targetMap = overrideMap || unsyncedAiMap;
    const entries = Object.entries(targetMap);
    if (entries.length === 0) return;

    setNotice({
      type: 'info',
      text: `Menyimpan ulang ${entries.length} hasil analisis AI ke database...`,
    });

    const remaining = { ...targetMap };
    let saved = 0;

    for (const [id, payload] of entries) {
      try {
        await persistAiToDb(id, payload);
        delete remaining[id];
        saved++;
      } catch {
        // Keep failed item in remaining map for subsequent retry
      }
    }

    setUnsyncedAiMap(remaining);
    if (Object.keys(remaining).length === 0) {
      setNotice({
        type: 'success',
        text: `Seluruh ${saved} hasil analisis AI berhasil tersimpan ke Cloud DB.`,
      });
      router.refresh();
    } else {
      setNotice({
        type: 'warning',
        text: `${saved} tersimpan, namun ${Object.keys(remaining).length} data masih gagal disinkronkan ke DB.`,
        actionLabel: 'Coba Simpan Lagi',
        onAction: () => retryUnsyncedDbSaves(remaining),
      });
    }
  }

  const handleSaveAiSettings = (nextSettings, meta = { mode: 'cloud' }) => {
    if (meta.mode === 'cloud') {
      setCloudAiSettings(nextSettings);
      // Clear raw secrets from browser localStorage once stored safely in Cloud Neon DB
      saveAiSettings({
        ...nextSettings,
        deepseekApiKey: '',
        openrouterApiKey: '',
      });
      const active = resolveActiveProvider(nextSettings);
      const providerLabel = active === 'muse' ? 'Muse.ai (VM + Scrapling)' : active === 'deepseek' ? 'DeepSeek' : 'OpenRouter Free';
      setShowAiSettingsModal(false);
      setNotice({
        type: 'success',
        text: `Pengaturan AI disimpan ke Cloud Neon DB (Provider utama: ${providerLabel}). Seluruh tim otomatis tersinkron.`,
      });
      router.refresh();
      return;
    }

    const savedLocal = saveAiSettings(nextSettings);
    const merged = mergeCloudAndLocalAiSettings(cloudAiSettings, savedLocal);
    const active = resolveActiveProvider(merged);
    const providerLabel = active === 'muse' ? 'Muse.ai (VM + Scrapling)' : active === 'deepseek' ? 'DeepSeek' : 'OpenRouter Free';
    setShowAiSettingsModal(false);
    setNotice({
      type: 'warning',
      text: `Pengaturan AI disimpan sementara di browser ini (Provider aktif: ${providerLabel}).`,
    });
  };

  async function handleAnalyzeSingle(lead) {
    if (!lead?.id) return;
    const key = String(lead.id);
    if (analyzingIds.includes(key)) return;

    if (!isAnyAiConfigured(aiSettings)) {
      setShowAiSettingsModal(true);
      setNotice({
        type: 'warning',
        text: 'Simpan API Key DeepSeek atau OpenRouter terlebih dahulu untuk menjalankan analisis AI.',
      });
      return;
    }

    setAnalyzingIds((prev) => [...prev, key]);
    setNotice(null);

    try {
      const aiResult = await analyzeLeadWithAi(lead, aiSettings);

      setLeads((prev) =>
        prev.map((item) =>
          String(item.id) === key ? { ...item, aiResearch: aiResult } : item
        )
      );

      try {
        await persistAiToDb(lead.id, aiResult);
        setUnsyncedAiMap((prev) => {
          if (!prev[key]) return prev;
          const copy = { ...prev };
          delete copy[key];
          return copy;
        });
        const fallbackNote = aiResult.fallbackFrom
          ? ` (dialihkan otomatis ke ${aiResult.providerUsed === 'deepseek' ? 'DeepSeek' : 'OpenRouter Free'})`
          : '';
        setNotice({
          type: aiResult.fallbackFrom ? 'warning' : 'success',
          text: `Analisis "${lead.name}" selesai: ${aiResult.leadQualification} (Skor ${aiResult.leadScore}/100)${fallbackNote}.`,
        });
      } catch {
        const nextUnsynced = { ...unsyncedAiMap, [key]: aiResult };
        setUnsyncedAiMap(nextUnsynced);
        setNotice({
          type: 'warning',
          text: `Analisis "${lead.name}" tampil di layar, namun gagal disimpan ke Cloud DB.`,
          actionLabel: 'Simpan Ulang ke DB',
          onAction: () => retryUnsyncedDbSaves(nextUnsynced),
        });
      }
    } catch (err) {
      if (err?.code === 'UNAUTHORIZED' || err?.code === 'MISSING_API_KEY') {
        setShowAiSettingsModal(true);
      }
      setNotice({
        type: 'error',
        text: `Gagal analisis "${lead.name}": ${err?.message || 'Kesalahan provider AI.'}`,
        actionLabel: err?.retryable ? 'Coba Lagi' : undefined,
        onAction: err?.retryable ? () => handleAnalyzeSingle(lead) : undefined,
      });
    } finally {
      setAnalyzingIds((prev) => prev.filter((id) => id !== key));
    }
  }

  const handleSaveEditedPitch = async (leadId, updatedResearch) => {
    const saved = await persistAiToDb(leadId, updatedResearch);
    setLeads((prev) =>
      prev.map((item) =>
        String(item.id) === String(leadId) ? { ...item, aiResearch: saved } : item
      )
    );
  };

  const stopBulkAnalysis = () => {
    if (bulkAbortRef.current) {
      bulkAbortRef.current.abort();
    }
  };

  const handleBulkAnalyze = async () => {
    if (bulkState.running) return;

    if (!isAnyAiConfigured(aiSettings)) {
      setShowAiSettingsModal(true);
      setNotice({
        type: 'warning',
        text: 'Simpan API Key DeepSeek atau OpenRouter terlebih dahulu sebelum menjalankan Riset AI Masal.',
      });
      return;
    }

    const activeProvider = resolveActiveProvider(aiSettings);
    const providerLabel =
      activeProvider === 'muse'
        ? 'Muse.ai (VM + Scrapling)'
        : activeProvider === 'deepseek'
          ? 'DeepSeek'
          : 'OpenRouter Free';
    const stepDelayMs = activeProvider === 'muse' ? 400 : activeProvider === 'deepseek' ? 900 : 3200;

    const queue =
      eligibleUnresearchedInFilter.length > 0
        ? eligibleUnresearchedInFilter
        : eligibleInFilter;

    if (queue.length === 0) {
      setNotice({
        type: 'info',
        text: 'Tidak ada prospek layak pada filter saat ini untuk dianalisis AI.',
      });
      return;
    }

    const skippedCount =
      filteredLeads.filter((l) => !l.aiResearch).length - queue.length;
    const skipNote =
      skippedCount > 0
        ? ` (${skippedCount} data Rekomendasi Hapus dilewati otomatis)`
        : '';

    if (
      activeProvider !== 'muse' &&
      !window.confirm(
        `Jalankan analisis AI (${providerLabel}) untuk ${queue.length} prospek layak pada filter saat ini${skipNote}?`
      )
    ) {
      return;
    }

    const abortController = new AbortController();
    bulkAbortRef.current = abortController;

    setBulkState({
      running: true,
      done: 0,
      total: queue.length,
      currentName: queue[0]?.name || '',
      note: `Memulai antrean via ${providerLabel}...`,
    });
    setNotice(null);

    let completed = 0;
    let failed = 0;

    for (let i = 0; i < queue.length; i++) {
      if (abortController.signal.aborted) break;

      const target = queue[i];
      const key = String(target.id);

      setBulkState((prev) => ({
        ...prev,
        currentName: target.name,
        note: `Memproses [${i + 1}/${queue.length}] (${providerLabel}): ${target.name}`,
      }));
      setAnalyzingIds((prev) => (prev.includes(key) ? prev : [...prev, key]));

      try {
        let aiResult;
        try {
          aiResult = await analyzeLeadWithAi(target, aiSettings, {
            signal: abortController.signal,
          });
        } catch (err) {
          if (err?.status === 429 && !abortController.signal.aborted) {
            setBulkState((prev) => ({
              ...prev,
              note: 'Rate limit tercapai, menunggu jeda aman 6 detik lalu mencoba kembali...',
            }));
            await new Promise((r) => setTimeout(r, 6200));
            aiResult = await analyzeLeadWithAi(
              target,
              { ...aiSettings, openrouterModel: DEFAULT_OPENROUTER_MODEL },
              { signal: abortController.signal }
            );
          } else {
            throw err;
          }
        }

        setLeads((prev) =>
          prev.map((item) =>
            String(item.id) === key ? { ...item, aiResearch: aiResult } : item
          )
        );

        try {
          await persistAiToDb(target.id, aiResult);
        } catch {
          setUnsyncedAiMap((prev) => ({ ...prev, [key]: aiResult }));
        }

        completed++;
        setBulkState((prev) => ({ ...prev, done: completed }));
      } catch (err) {
        if (err?.code === 'ABORTED') break;
        failed++;
        if (err?.code === 'UNAUTHORIZED' || err?.code === 'MISSING_API_KEY') {
          setShowAiSettingsModal(true);
          setNotice({
            type: 'error',
            text: err.message,
          });
          setAnalyzingIds((prev) => prev.filter((id) => id !== key));
          break;
        }
      } finally {
        setAnalyzingIds((prev) => prev.filter((id) => id !== key));
      }

      if (i < queue.length - 1 && !abortController.signal.aborted) {
        await new Promise((resolve) => {
          const t = setTimeout(resolve, stepDelayMs);
          abortController.signal.addEventListener(
            'abort',
            () => {
              clearTimeout(t);
              resolve();
            },
            { once: true }
          );
        });
      }
    }

    const wasAborted = abortController.signal.aborted;
    bulkAbortRef.current = null;
    setBulkState({
      running: false,
      done: completed,
      total: queue.length,
      currentName: '',
      note: '',
    });

    if (completed > 0 || failed > 0) {
      setNotice({
        type: failed > 0 ? 'warning' : 'success',
        text: wasAborted
          ? `Riset masal dihentikan: ${completed} berhasil disimpan${failed > 0 ? `, ${failed} gagal` : ''}.`
          : `Riset masal selesai: ${completed} prospek berhasil dianalisis${failed > 0 ? `, ${failed} dilewati karena kendala model` : ''}.`,
      });
      router.refresh();
    }
  };

  const executeBatchCleanupDelete = async (idsToDelete) => {
    const idSet = new Set(idsToDelete.map(String));
    const snapshot = leads;

    setLeads((prev) => prev.filter((item) => !idSet.has(String(item.id))));
    if (selectedLeadId !== null && idSet.has(String(selectedLeadId))) {
      setSelectedLeadId(null);
    }

    try {
      const res = await fetch('/api/delete-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: idsToDelete }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      setShowCleanupModal(false);
      if (viabilityFilter === 'RECOMMEND_DELETE') {
        setViabilityFilter('ALL');
      }
      setNotice({
        type: 'success',
        text: `Berhasil membersihkan ${data.deletedCount || idsToDelete.length} prospek tidak layak dari database.`,
      });
      router.refresh();
    } catch (err) {
      setLeads(snapshot);
      throw err;
    }
  };

  const executeDeleteLead = async (lead) => {
    const key = String(lead.id);
    if (deletingIds.includes(key)) return;

    const snapshot = leads;
    setDeletingIds((prev) => [...prev, key]);
    setLeads((prev) => prev.filter((l) => String(l.id) !== key));
    if (String(selectedLeadId) === key) setSelectedLeadId(null);

    try {
      const res = await fetch('/api/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: lead.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setNotice({
        type: 'success',
        text: `Prospek "${lead.name}" berhasil dihapus.`,
      });
      router.refresh();
    } catch (err) {
      setLeads(snapshot);
      setNotice({
        type: 'error',
        text: `Gagal menghapus "${lead.name}": ${err.message}`,
        actionLabel: 'Coba Hapus Lagi',
        onAction: () => executeDeleteLead(lead),
      });
    } finally {
      setDeletingIds((prev) => prev.filter((id) => id !== key));
    }
  };

  const handleDelete = (lead) => {
    if (!window.confirm(`Hapus prospek "${lead.name}" dari database?`)) return;
    executeDeleteLead(lead);
  };

  const executeDeleteAll = async () => {
    if (deletingAll) return;
    const snapshot = leads;
    setDeletingAll(true);
    setLeads([]);

    try {
      const res = await fetch('/api/delete-all', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setNotice({
        type: 'success',
        text: 'Seluruh data prospek telah dikosongkan dari database.',
      });
      router.refresh();
    } catch (err) {
      setLeads(snapshot);
      setNotice({
        type: 'error',
        text: `Gagal mengosongkan database: ${err.message}`,
        actionLabel: 'Coba Lagi',
        onAction: executeDeleteAll,
      });
    } finally {
      setDeletingAll(false);
    }
  };

  const handleDeleteAll = () => {
    if (leads.length === 0 || deletingAll) return;
    if (!window.confirm(`Yakin ingin menghapus SEMUA (${leads.length}) prospek di database?`)) {
      return;
    }
    executeDeleteAll();
  };

  const handleExportCsv = () => {
    if (filteredLeads.length === 0) {
      setNotice({
        type: 'warning',
        text: 'Tidak ada baris prospek pada filter saat ini untuk diekspor.',
      });
      return;
    }

    const headers = [
      'Nama Bisnis',
      'Status Kelayakan',
      'Rating',
      'Ulasan',
      'Kategori',
      'Alamat',
      'Telepon',
      'WhatsApp',
      'Website',
      'Sosmed',
      'Online Shop',
      'Kualifikasi AI',
      'Skor AI',
      'Peluang Layanan',
      'Riset Jejak Digital',
      'Pitch WA Utama',
      'Follow Up WA',
      'Maps URL',
      'Tanggal Scrape',
      'Status Chat',
      'Waktu Dichat',
    ];

    const escapeCsv = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;

    const rows = [
      headers.map(escapeCsv).join(','),
      ...filteredLeads.map((l) => {
        const ev = evaluationById.get(String(l.id));
        const viabilityText = ev?.recommendDelete
          ? `Rekomendasi Hapus (${ev.shortLabel})`
          : ev?.shortLabel || 'Layak';
        return [
          l.name,
          viabilityText,
          l.rating,
          l.reviewCount,
          l.categoryName,
          l.address,
          l.phone,
          l.whatsapp || l.phone,
          l.website,
          l.socialMedia,
          l.onlineShop,
          l.aiResearch?.leadQualification,
          l.aiResearch?.leadScore,
          l.aiResearch?.opportunityType,
          l.aiResearch?.digitalPresenceSummary,
          l.aiResearch?.pitchDraft,
          l.aiResearch?.followUpDraft,
          l.mapsUrl,
          l.scrapedAt,
          l.chatStatus === 'SUDAH' ? 'Sudah Dichat' : 'Belum Dichat',
          l.contactedAt || '',
        ]
          .map(escapeCsv)
          .join(',');
      }),
    ];

    const blob = new Blob(['\uFEFF' + rows.join('\r\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `gmaps_leads_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setNotice({
      type: 'success',
      text: `Berhasil mengunduh CSV (${filteredLeads.length} baris prospek).`,
    });
  };

  const [scrapingMuse, setScrapingMuse] = useState(false);

  const handleScrapeLocationWithMuse = async (targetQuery, refreshCommandBar) => {
    if (scrapingMuse) return;
    setScrapingMuse(true);
    setNotice(null);
    try {
      const existingKeys = [];
      for (const l of leads) {
        existingKeys.push(
          `${String(l.name || '').toLowerCase().replace(/\s+/g, ' ').trim()}|${String(l.address || '').toLowerCase().replace(/\s+/g, ' ').trim()}`
        );
        const ph = String(l.whatsapp || l.phone || '').replace(/[^\d]/g, '');
        if (ph) existingKeys.push(ph);
      }

      const res = await fetch('/api/ai/muse-scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetQuery,
          existingKeys,
          aiSettings: {
            primaryProvider: aiSettings.primaryProvider,
            deepseekApiKey: aiSettings.deepseekApiKey,
            deepseekModel: aiSettings.deepseekModel,
            openrouterApiKey: aiSettings.openrouterApiKey,
            openrouterModel: aiSettings.openrouterModel,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Gagal menjalankan scraping lokasi via Muse.ai.');
      }

      if (Array.isArray(data.allLeads) && data.allLeads.length > 0) {
        setLeads(data.allLeads);
        setNotice({
          type: 'success',
          text: `[Scrapling Muse.ai] Data daerah "${data.targetQuery}" berhasil disinkronkan: total ${data.allLeads.length} usaha lokal terpetakan per Jenis Usaha & Status Website!`,
        });
        return;
      }

      const incomingLeads = Array.isArray(data.leads) ? data.leads : [];
      if (incomingLeads.length === 0) {
        setNotice({
          type: 'info',
          text: `Seluruh kandidat usaha tanpa website untuk "${data.targetQuery}" sudah ada di tabel (0 duplikat ditambahkan). Ubah kata kunci/lokasi untuk mencari area baru.`,
        });
        return;
      }

      setLeads((prev) => {
        const prevKeySet = new Set(
          prev.map(
            (p) =>
              `${String(p.name || '').toLowerCase().replace(/\s+/g, ' ').trim()}|${String(p.address || '').toLowerCase().replace(/\s+/g, ' ').trim()}`
          )
        );
        const uniqueNew = incomingLeads.filter(
          (item) =>
            !prevKeySet.has(
              `${String(item.name || '').toLowerCase().replace(/\s+/g, ' ').trim()}|${String(item.address || '').toLowerCase().replace(/\s+/g, ' ').trim()}`
            )
        );
        return [...uniqueNew, ...prev];
      });

      const logMsg = `[Scrapling Muse.ai] Berhasil menemukan ${incomingLeads.length} lokasi usaha tanpa website resmi untuk "${data.targetQuery}". Siap dijalankan Riset AI Masal!`;
      await fetch('/api/automation/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'LOG_EVENT',
          type: 'success',
          message: logMsg,
        }),
      }).catch(() => {});

      if (refreshCommandBar) refreshCommandBar();

      setNotice({
        type: 'success',
        text: logMsg,
      });
    } catch (err) {
      setNotice({
        type: 'error',
        text: err?.message || 'Gagal scraping lokasi via Muse.ai.',
      });
    } finally {
      setScrapingMuse(false);
    }
  };

  const hasApiKey = isAnyAiConfigured(aiSettings);
  const resolvedProv = resolveActiveProvider(aiSettings);
  const activeProviderName =
    resolvedProv === 'muse'
      ? 'Muse.ai (VM)'
      : resolvedProv === 'deepseek'
        ? 'DeepSeek'
        : 'OpenRouter';
  const isCloudSynced = Boolean(
    aiSettings.cloudDeepseekReady || aiSettings.cloudOpenrouterReady
  );

  return (
    <div className="max-w-7xl xl:max-w-[1540px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-5">
      {/* 1. PAGE HEADER & PRIMARY ACTIONS */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-zinc-800/80">
        <div className="space-y-1">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
            Dashboard Prospek
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400">
            Fokus pada usaha aktif yang belum memiliki website resmi, analisis celah bisnis dengan AI, dan kirim pesan WhatsApp natural.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleBulkAnalyze}
            disabled={bulkState.running || eligibleInFilter.length === 0}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-zinc-100 hover:bg-white text-zinc-950 transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            title="Analisis otomatis seluruh prospek layak pada filter/kategori aktif"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span>
              {eligibleUnresearchedInFilter.length > 0
                ? `Riset AI Masal (${eligibleUnresearchedInFilter.length})`
                : eligibleInFilter.length > 0
                  ? `Riset Ulang AI Masal (${eligibleInFilter.length})`
                  : 'Riset AI Masal'}
            </span>
          </button>

          {cleanupSummary.totalFlagged > 0 && (
            <button
              type="button"
              onClick={() => setShowCleanupModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-rose-950/45 hover:bg-rose-950/75 text-rose-200 border border-rose-900/70 transition-colors"
              title="Tinjau dan bersihkan prospek yang sudah punya web, tutup, franchise, atau tanpa kontak"
            >
              <span>Rekomendasi Hapus ({cleanupSummary.totalFlagged})</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowAiSettingsModal(true)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 hover:border-zinc-700 transition-colors"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                hasApiKey ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            />
            <span>
              AI: {activeProviderName}
              {isCloudSynced ? ' (Cloud)' : ''}
            </span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filteredLeads.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 transition-colors disabled:opacity-40"
          >
            <svg className="w-3.5 h-3.5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            onClick={() => setShowExtensionModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 transition-colors"
          >
            <span>Panduan Ekstensi</span>
          </button>

          {totalLeads > 0 && (
            <button
              type="button"
              onClick={handleDeleteAll}
              disabled={deletingAll}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-rose-300 hover:bg-rose-950/30 border border-transparent hover:border-rose-900/50 transition-colors disabled:opacity-40"
            >
              <span>{deletingAll ? 'Menghapus...' : 'Hapus Semua'}</span>
            </button>
          )}
        </div>
      </div>

      {/* 1B. COMMAND CENTER: OTOMATISASIKAN CALON CLIENT (07:00 - 15:00 WIB) */}
      <AutomationCommandBar
        eligibleCount={chatUncontactedCount}
        onRunDryRunSimulation={handleRunDryRunSimulation}
        onScrapeLocationWithMuse={handleScrapeLocationWithMuse}
        onResetAutopilotStages={() => {
          resetAllFilters();
          setNotice({
            type: 'info',
            text: 'Status otomasi, kuota harian (0/20), log, dan filter telah di-reset.',
          });
        }}
        isScrapingMuse={scrapingMuse}
      />

      {/* 2. ACTION FEEDBACK & BULK PROGRESS BANNERS */}
      {notice && (
        <div
          role="status"
          className={`p-3.5 rounded-xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            notice.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-900/70 text-emerald-200'
              : notice.type === 'error'
                ? 'bg-rose-950/40 border-rose-900/70 text-rose-200'
                : notice.type === 'warning'
                  ? 'bg-amber-950/40 border-amber-900/70 text-amber-200'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-200'
          }`}
        >
          <span className="leading-relaxed">{notice.text}</span>
          <div className="flex items-center gap-2 shrink-0">
            {notice.actionLabel && notice.onAction && (
              <button
                type="button"
                onClick={notice.onAction}
                className="px-3 py-1 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 font-semibold transition-colors"
              >
                {notice.actionLabel}
              </button>
            )}
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="px-2 py-1 rounded-lg text-zinc-400 hover:text-white transition-colors"
              aria-label="Tutup notifikasi"
            >
              Tutup
            </button>
          </div>
        </div>
      )}

      {bulkState.running && (
        <div className="clean-card rounded-xl p-4 space-y-2.5 border-zinc-700">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-3.5 h-3.5 border-2 border-zinc-400/30 border-t-white rounded-full animate-spin shrink-0" />
              <span className="font-semibold text-white truncate">{bulkState.note}</span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="font-mono text-zinc-400">
                {bulkState.done} / {bulkState.total} selesai
              </span>
              <button
                type="button"
                onClick={stopBulkAnalysis}
                className="px-3 py-1 rounded-lg bg-rose-950/60 hover:bg-rose-900/70 text-rose-200 border border-rose-900/80 font-medium transition-colors"
              >
                Hentikan
              </button>
            </div>
          </div>
          <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full bg-zinc-100 transition-all duration-300"
              style={{
                width: `${
                  bulkState.total > 0
                    ? Math.round((bulkState.done / bulkState.total) * 100)
                    : 0
                }%`,
              }}
            />
          </div>
        </div>
      )}

      {/* 3. INTERACTIVE KPI CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-3.5">
        <button
          type="button"
          onClick={resetAllFilters}
          className="text-left p-4 rounded-xl clean-card-interactive"
        >
          <div className="text-xs font-medium text-zinc-400">Total Prospek</div>
          <div className="text-2xl font-bold text-white tracking-tight mt-1">{totalLeads}</div>
          <div className="text-[11px] text-zinc-500 mt-1">
            {filteredCount} ditampilkan &bull; {researchedCount} diriset AI
          </div>
        </button>

        <button
          type="button"
          onClick={() =>
            setViabilityFilter(viabilityFilter === 'ELIGIBLE' ? 'ALL' : 'ELIGIBLE')
          }
          className={`text-left p-4 rounded-xl border transition-colors ${
            viabilityFilter === 'ELIGIBLE'
              ? 'bg-zinc-800/70 border-zinc-400'
              : 'bg-[#121215] border-zinc-800/80 hover:border-zinc-700'
          }`}
        >
          <div className="flex items-center justify-between gap-1">
            <span className="text-xs font-medium text-zinc-400 truncate">Layak Prospek</span>
            <span className="text-[10px] text-emerald-200 bg-emerald-950/60 border border-emerald-900/60 px-1.5 py-0.5 rounded shrink-0">
              Tanpa Web Resmi
            </span>
          </div>
          <div className="text-2xl font-bold text-white tracking-tight mt-1">{eligibleCount}</div>
          <div className="text-[11px] text-zinc-500 mt-1">
            {noWebsiteCount} belum punya domain mandiri
          </div>
        </button>

        <button
          type="button"
          onClick={() => setAiFilter(aiFilter === 'HOT' ? 'ALL' : 'HOT')}
          className={`text-left p-4 rounded-xl border transition-colors ${
            aiFilter === 'HOT'
              ? 'bg-zinc-800/70 border-zinc-400'
              : 'bg-[#121215] border-zinc-800/80 hover:border-zinc-700'
          }`}
        >
          <div className="flex items-center justify-between gap-1">
            <span className="text-xs font-medium text-zinc-400 truncate">Hot Leads (AI)</span>
            <span className="text-[10px] text-rose-200 bg-rose-950/60 border border-rose-900/60 px-1.5 py-0.5 rounded shrink-0">
              Prioritas
            </span>
          </div>
          <div className="text-2xl font-bold text-white tracking-tight mt-1">{hotLeadsCount}</div>
          <div className="text-[11px] text-zinc-500 mt-1">Potensi konversi tertinggi</div>
        </button>

        <button
          type="button"
          onClick={() =>
            setViabilityFilter(
              viabilityFilter === 'RECOMMEND_DELETE' ? 'ALL' : 'RECOMMEND_DELETE'
            )
          }
          className={`text-left p-4 rounded-xl border transition-colors ${
            viabilityFilter === 'RECOMMEND_DELETE'
              ? 'bg-rose-950/35 border-rose-700/80'
              : 'bg-[#121215] border-zinc-800/80 hover:border-zinc-700'
          }`}
        >
          <div className="flex items-center justify-between gap-1">
            <span className="text-xs font-medium text-zinc-400 truncate">Rekomendasi Hapus</span>
            <span className="text-[10px] text-zinc-300 bg-zinc-800 px-1.5 py-0.5 rounded shrink-0">
              Filter Sampah
            </span>
          </div>
          <div className="text-2xl font-bold text-white tracking-tight mt-1">
            {cleanupSummary.totalFlagged}
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">
            Ada web resmi, franchise, tutup, atau tanpa kontak
          </div>
        </button>
      </div>

            {/* 4. PIPELINE FUNNEL 5 TAHAP & FILTER RINGKAS */}
      <div className="p-4 rounded-xl clean-card space-y-3.5">
        <div className="flex flex-wrap items-center gap-1.5 pb-3 border-b border-zinc-800/70">
          <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mr-1.5">
            Tahap Funnel:
          </span>
          {[
            { id: 'ALL', label: `Semua (${totalLeads})` },
            { id: 'QUEUED', label: `1. Antrean Baru (${stageCounts.QUEUED || 0})` },
            { id: 'CHAT1_SENT', label: `2. Chat 1 Terkirim (${stageCounts.CHAT1_SENT || 0})` },
            { id: 'QUALIFYING', label: `3. Tektokan Kualifikasi (${stageCounts.QUALIFYING || 0})` },
            { id: 'MOCKUP_SENT', label: `4. Mockup Terkirim (${stageCounts.MOCKUP_SENT || 0})` },
            {
              id: 'HANDOVER_TO_HUMAN',
              label: `5. Siap Closing / Tim (${stageCounts.HANDOVER_TO_HUMAN || 0})`,
            },
          ].map((stageOpt) => (
            <button
              key={stageOpt.id}
              type="button"
              onClick={() =>
                setPipelineFilter(pipelineFilter === stageOpt.id ? 'ALL' : stageOpt.id)
              }
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                pipelineFilter === stageOpt.id
                  ? 'bg-zinc-100 text-zinc-950 font-semibold shadow-sm'
                  : 'bg-zinc-900/90 text-zinc-300 border border-zinc-800 hover:border-zinc-700 hover:text-white'
              }`}
            >
              {stageOpt.label}
            </button>
          ))}
        </div>

        {availableCategories.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pb-3 border-b border-zinc-800/70">
            <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mr-1.5">
              Jenis Usaha:
            </span>
            <button
              type="button"
              onClick={() => setCategoryFilter('ALL')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                categoryFilter === 'ALL'
                  ? 'bg-emerald-500 text-zinc-950 font-semibold'
                  : 'text-zinc-300 hover:text-white bg-zinc-900/90 border border-zinc-800'
              }`}
            >
              Semua Usaha ({totalLeads})
            </button>
            {availableCategories.map((cat) => (
              <button
                type="button"
                key={cat}
                onClick={() => setCategoryFilter(categoryFilter === cat ? 'ALL' : cat)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  categoryFilter === cat
                    ? 'bg-emerald-500 text-zinc-950 font-semibold'
                    : 'text-zinc-300 hover:text-white bg-zinc-900/90 border border-zinc-800'
                }`}
              >
                <span>{cat}</span>
                <span className="text-[10px] opacity-80 font-mono">
                  ({categoryCounts[cat] || 0})
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5 pb-3 border-b border-zinc-800/70">
          <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mr-1.5">
            Pemisah Status Website:
          </span>
          {[
            { id: 'ALL', label: `Semua (${totalLeads})` },
            { id: 'NO_WEB', label: `Belum Punya Website Resmi (${noWebsiteCount})` },
            {
              id: 'SOCIAL_ONLY',
              label: `Hanya Sosmed / Olshop (${leads.filter((l) => l.websiteStatus === 'social_only' || (!l.website && (l.socialMedia || l.onlineShop))).length})`,
            },
            {
              id: 'DEAD_WEB',
              label: `Domain Lama Mati / 404 (${leads.filter((l) => l.websiteStatus === 'website_dead' || l.deadWebsiteUrl).length})`,
            },
            {
              id: 'HAS_WEB',
              label: `Sudah Punya Website Resmi (${totalLeads - noWebsiteCount})`,
            },
          ].map((wOpt) => (
            <button
              key={wOpt.id}
              type="button"
              onClick={() =>
                setWebsiteFilter(websiteFilter === wOpt.id ? 'ALL' : wOpt.id)
              }
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                websiteFilter === wOpt.id
                  ? 'bg-sky-400 text-zinc-950 font-semibold'
                  : 'text-zinc-300 hover:text-white bg-zinc-900/90 border border-zinc-800'
              }`}
            >
              {wOpt.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-500">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              className="w-full clean-input rounded-xl py-2 pl-9 pr-8 text-xs"
              placeholder="Cari nama bisnis, alamat, nomor WA, atau kategori..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-500 hover:text-white text-xs"
                aria-label="Bersihkan pencarian"
              >
                &times;
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setMobileFiltersOpen((prev) => !prev)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 shrink-0 transition-colors"
          >
            <span>{mobileFiltersOpen ? 'Tutup Filter' : 'Filter Lanjutan'}</span>
            {activeFilterCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-md bg-zinc-100 text-zinc-950 text-[10px] font-bold">
                {activeFilterCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              resetAllFilters();
              setNotice({
                type: 'info',
                text: 'Seluruh filter pencarian dan tampilan tabel telah di-reset.',
              });
            }}
            className="px-3 py-2 rounded-xl text-xs font-medium text-zinc-300 hover:text-white bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-colors whitespace-nowrap shrink-0"
          >
            Reset Filter
          </button>
        </div>

        <div
          className={`${
            mobileFiltersOpen ? 'block' : 'hidden'
          } space-y-3.5 pt-3 border-t border-zinc-800/70 text-xs`}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
            {/* Status Chat Filter */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
                Status Chat WA
              </span>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: 'ALL', label: 'Semua' },
                  { id: 'UNCONTACTED', label: `Belum (${chatUncontactedCount})` },
                  { id: 'CONTACTED', label: `Selesai (${chatContactedCount})` },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setChatFilter(opt.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${
                      chatFilter === opt.id
                        ? 'bg-zinc-100 text-zinc-950 font-semibold shadow-sm'
                        : 'bg-zinc-900/90 text-zinc-400 border border-zinc-800 hover:text-zinc-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            {/* Viability Filter */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
                Kelayakan Target
              </span>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: 'ALL', label: 'Semua' },
                  { id: 'ELIGIBLE', label: `Layak (${eligibleCount})` },
                  {
                    id: 'RECOMMEND_DELETE',
                    label: `Rekomendasi Hapus (${cleanupSummary.totalFlagged})`,
                  },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setViabilityFilter(opt.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${
                      viabilityFilter === opt.id
                        ? 'bg-zinc-100 text-zinc-950 font-semibold shadow-sm'
                        : 'bg-zinc-900/90 text-zinc-400 border border-zinc-800 hover:text-zinc-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Website Filter */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
                Domain Mandiri
              </span>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: 'ALL', label: 'Semua' },
                  { id: 'NO_WEB', label: `Belum Punya (${noWebsiteCount})` },
                  { id: 'HAS_WEB', label: 'Sudah Punya' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setWebsiteFilter(opt.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${
                      websiteFilter === opt.id
                        ? 'bg-zinc-100 text-zinc-950 font-semibold shadow-sm'
                        : 'bg-zinc-900/90 text-zinc-400 border border-zinc-800 hover:text-zinc-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Channel Filter */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
                Saluran &amp; Toko
              </span>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: 'ALL', label: 'Semua' },
                  { id: 'HAS_WA', label: 'WhatsApp' },
                  { id: 'HAS_SHOP', label: 'Olshop' },
                  { id: 'HAS_SOCIAL', label: 'Sosmed' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setChannelFilter(opt.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${
                      channelFilter === opt.id
                        ? 'bg-zinc-100 text-zinc-950 font-semibold shadow-sm'
                        : 'bg-zinc-900/90 text-zinc-400 border border-zinc-800 hover:text-zinc-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* AI & Rating Filter */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
                Kualifikasi AI &amp; Rating
              </span>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: 'ALL', label: 'Semua' },
                  { id: 'HOT', label: 'Hot' },
                  { id: 'WARM', label: 'Warm' },
                  { id: 'COLD', label: 'Cold' },
                  { id: 'UNRESEARCHED', label: 'Belum Riset' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setAiFilter(opt.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${
                      aiFilter === opt.id
                        ? 'bg-zinc-100 text-zinc-950 font-semibold shadow-sm'
                        : 'bg-zinc-900/90 text-zinc-400 border border-zinc-800 hover:text-zinc-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setRatingFilter(ratingFilter === '4.5' ? 'ALL' : '4.5')}
                  className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${
                    ratingFilter === '4.5'
                      ? 'bg-zinc-100 text-zinc-950 font-semibold shadow-sm'
                      : 'bg-zinc-900/90 text-zinc-400 border border-zinc-800 hover:text-zinc-200'
                  }`}
                >
                  Rating &ge; 4.5
                </button>
              </div>
            </div>
          </div>

          {availableCategories.length > 0 && (
            <div className="pt-2.5 border-t border-zinc-800/60 flex items-center gap-1.5 overflow-x-auto pb-1">
              <span className="text-[11px] text-zinc-500 whitespace-nowrap mr-1">Kategori:</span>
              <button
                type="button"
                onClick={() => setCategoryFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg text-xs whitespace-nowrap transition-colors ${
                  categoryFilter === 'ALL'
                    ? 'bg-zinc-100 text-zinc-950 font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200 bg-zinc-900/70 border border-zinc-800'
                }`}
              >
                Semua ({totalLeads})
              </button>
              {availableCategories.map((cat) => (
                <button
                  type="button"
                  key={cat}
                  onClick={() => setCategoryFilter(categoryFilter === cat ? 'ALL' : cat)}
                  className={`px-2.5 py-1 rounded-lg text-xs whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                    categoryFilter === cat
                      ? 'bg-zinc-100 text-zinc-950 font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200 bg-zinc-900/70 border border-zinc-800'
                  }`}
                >
                  <span>{cat}</span>
                  <span className="text-[10px] opacity-70 font-mono">
                    ({categoryCounts[cat] || 0})
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 5. DATA DISPLAY: EMPTY STATE / MOBILE CARDS / DESKTOP TABLE */}
      <SectionErrorBoundary title="Gagal menampilkan daftar prospek">
        {filteredLeads.length === 0 ? (
          <div className="clean-card rounded-2xl p-10 sm:p-14 text-center space-y-3">
            <div className="w-11 h-11 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto text-zinc-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h2 className="text-sm font-semibold text-white">
              {totalLeads === 0
                ? 'Belum Ada Prospek Tersimpan'
                : 'Tidak Ada Prospek yang Cocok dengan Filter'}
            </h2>
            <p className="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed">
              {totalLeads === 0
                ? 'Jalankan ekstensi Chrome di Google Maps lalu tekan Sinkron ke Dashboard, atau unggah file export JSON secara manual.'
                : 'Coba longgarkan filter pencarian atau tekan Reset untuk melihat seluruh data prospek.'}
            </p>
            <div className="pt-1 flex items-center justify-center gap-2">
              {totalLeads === 0 ? (
                <Link
                  href="/import"
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-zinc-100 hover:bg-white text-zinc-950 transition-colors"
                >
                  Import File JSON
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-zinc-100 hover:bg-white text-zinc-950 transition-colors"
                >
                  Reset Semua Filter
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* MOBILE & TABLET CARD VIEW (< lg) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 lg:hidden">
              {paginatedLeads.map((lead, idx) => {
                const key = String(lead.id ?? idx);
                const evalInfo =
                  evaluationById.get(key) || evaluateLeadQualification(lead);
                const isAnalyzing = analyzingIds.includes(key);
                const isDeleting = deletingIds.includes(key);
                const waDigits = normalizeWa(lead.whatsapp || lead.phone, lead.geoScope);
                const qual = lead.aiResearch?.leadQualification || '';
                const score = lead.aiResearch?.leadScore;
                const qualStyle = getQualificationStyles(qual);

                const defaultPitch = buildDefaultWaPitch(lead, aiSettings);
                const waText = lead.aiResearch?.pitchDraft || defaultPitch;
                const waUrl = waDigits
                  ? `https://wa.me/${waDigits}?text=${encodeURIComponent(waText)}`
                  : '';
                const mapsHref =
                  lead.mapsUrl ||
                  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    `${lead.name} ${lead.address || ''}`.trim()
                  )}`;

                return (
                  <div
                    key={key}
                    className={`clean-card rounded-xl p-4 flex flex-col justify-between gap-3.5 ${
                      evalInfo.recommendDelete ? 'opacity-80 border-rose-950/60' : ''
                    }`}
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-white leading-snug line-clamp-2">
                            {lead.name}
                          </h3>
                          <p className="text-[11px] text-zinc-400 mt-0.5 truncate">
                            {lead.categoryName || 'Bisnis Lokal'}
                          </p>
                        </div>

                        {lead.rating && (
                          <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-900 border border-zinc-800 text-xs font-medium text-amber-400">
                            <span>&#9733; {lead.rating}</span>
                            <span className="text-[10px] text-zinc-500">
                              ({lead.reviewCount || 0})
                            </span>
                          </span>
                        )}
                      </div>

                      {lead.address && (
                        <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                          {lead.address}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                        {evalInfo.recommendDelete ? (
                          <button
                            type="button"
                            onClick={() => setShowCleanupModal(true)}
                            title={evalInfo.reasonTitle}
                            className="px-2 py-0.5 rounded-md bg-rose-950/55 text-rose-200 border border-rose-900/70 font-medium"
                          >
                            Hapus: {evalInfo.shortLabel}
                          </button>
                        ) : evalInfo.tier === 'PRIME' ? (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-950/45 text-emerald-200 border border-emerald-900/60">
                            Target Potensial
                          </span>
                        ) : null}

                        {lead.website ? (
                          <a
                            href={lead.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2 py-0.5 rounded-md bg-zinc-900 text-zinc-200 border border-zinc-700 hover:border-zinc-500 underline underline-offset-2"
                          >
                            {evalInfo.websiteType === 'FREE_BUILDER'
                              ? 'Web Gratisan'
                              : evalInfo.websiteType === 'OWNED_DOMAIN'
                                ? 'Domain Mandiri'
                                : 'Tautan Web'}
                          </a>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md bg-zinc-900/90 text-zinc-400 border border-zinc-800">
                            Belum Ada Web
                          </span>
                        )}

                        {lead.onlineShop && (
                          <a
                            href={lead.onlineShop}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2 py-0.5 rounded-md bg-zinc-900 text-zinc-300 border border-zinc-800 hover:border-zinc-600"
                          >
                            {getShopLabel(lead.onlineShop)}
                          </a>
                        )}

                        {lead.socialMedia && (
                          <a
                            href={lead.socialMedia}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2 py-0.5 rounded-md bg-zinc-900 text-zinc-300 border border-zinc-800 hover:border-zinc-600"
                          >
                            {getSocialLabel(lead.socialMedia)}
                          </a>
                        )}

                        {(lead.whatsapp || lead.phone) && (
                          <span className="px-2 py-0.5 rounded-md bg-zinc-900/60 text-zinc-300 border border-zinc-800/80 font-mono">
                            {lead.whatsapp || lead.phone}
                          </span>
                        )}
                      </div>

                      {lead.aiResearch && (
                        <button
                          type="button"
                          onClick={() => setSelectedLeadId(lead.id)}
                          className="w-full text-left p-2.5 rounded-lg bg-[#18181b] border border-zinc-800 hover:border-zinc-700 transition-colors space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-zinc-200">
                              <span className={`w-1.5 h-1.5 rounded-full ${qualStyle.dot}`} />
                              <span>{qual}</span>
                              {typeof score === 'number' && (
                                <span className="text-zinc-400 font-mono">({score})</span>
                              )}
                            </span>
                            <span className="text-[10px] text-zinc-400">Lihat Pitch &rarr;</span>
                          </div>
                          {lead.aiResearch.digitalPresenceSummary && (
                            <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">
                              {lead.aiResearch.digitalPresenceSummary}
                            </p>
                          )}
                        </button>
                      )}
                    </div>

                    <div className="pt-2.5 border-t border-zinc-800/80 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {waUrl ? (
                          <button
                            type="button"
                            onClick={() => handleOpenChat(lead, waUrl)}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-100 hover:bg-white text-zinc-950 transition-colors inline-flex items-center gap-1"
                            title="Buka WhatsApp & otomatis tandai selesai dichat"
                          >
                            <span>Chat WA</span>
                            {lead.chatStatus === 'SUDAH' && (
                              <span className="text-emerald-700 font-bold">&#10003;</span>
                            )}
                          </button>
                        ) : (
                          <span className="px-2.5 py-1.5 rounded-lg text-xs text-zinc-600 bg-zinc-900/60 border border-zinc-800/60">
                            Tanpa WA
                          </span>
                        )}

                        {lead.aiResearch ? (
                          <button
                            type="button"
                            onClick={() => setSelectedLeadId(lead.id)}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 transition-colors"
                          >
                            Detail AI
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleAnalyzeSingle(lead)}
                            disabled={isAnalyzing}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 transition-colors disabled:opacity-50"
                          >
                            {isAnalyzing && (
                              <span className="w-3 h-3 border-2 border-zinc-400/30 border-t-white rounded-full animate-spin" />
                            )}
                            <span>{isAnalyzing ? 'Menganalisis...' : 'Analisis AI'}</span>
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <a
                          href={mapsHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-200 hover:text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/80 transition-colors shadow-sm"
                          title="Buka lokasi di Google Maps"
                        >
                          <svg className="w-3.5 h-3.5 text-rose-400 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z"/>
                          </svg>
                          <span>Maps</span>
                        </a>
                        <button
                          type="button"
                          onClick={() => handleDelete(lead)}
                          disabled={isDeleting}
                          className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-950/30 transition-colors disabled:opacity-40"
                          title="Hapus prospek ini"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* DESKTOP TABLE VIEW (lg+) */}
            <div className="hidden lg:block rounded-xl clean-card overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[1050px]">
                  <thead>
                    <tr className="border-b border-zinc-800 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider bg-[#16161a]">
                      <th className="py-3.5 px-4">Nama Bisnis &amp; Waktu Import</th>
                      <th className="py-3.5 px-3">Rating</th>
                      <th className="py-3.5 px-4">Alamat</th>
                      <th className="py-3.5 px-4">Kontak</th>
                      <th className="py-3.5 px-3">Website</th>
                      <th className="py-3.5 px-3">Sosmed / Olshop</th>
                      <th className="py-3.5 px-3">Kualifikasi &amp; AI</th>
                      <th className="py-3.5 px-3">Status Chat</th>
                      <th className="py-3.5 px-4 text-right sticky right-0 bg-[#16161a] z-20 shadow-[-8px_0_12px_-4px_rgba(0,0,0,0.6)] border-l border-zinc-800/80 min-w-[190px]">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 text-xs text-zinc-300">
                    {paginatedLeads.map((lead, idx) => {
                      const key = String(lead.id ?? idx);
                      const evalInfo =
                        evaluationById.get(key) || evaluateLeadQualification(lead);
                      const isAnalyzing = analyzingIds.includes(key);
                      const isDeleting = deletingIds.includes(key);
                      const waDigits = normalizeWa(lead.whatsapp || lead.phone, lead.geoScope);
                      const qual = lead.aiResearch?.leadQualification || '';
                      const score = lead.aiResearch?.leadScore;
                      const qualStyle = getQualificationStyles(qual);

                      const defaultPitch = buildDefaultWaPitch(lead, aiSettings);
                      const waText = lead.aiResearch?.pitchDraft || defaultPitch;
                      const waUrl = waDigits
                        ? `https://wa.me/${waDigits}?text=${encodeURIComponent(waText)}`
                        : '';
                      const mapsHref =
                        lead.mapsUrl ||
                        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                          `${lead.name} ${lead.address || ''}`.trim()
                        )}`;

                      return (
                        <tr
                          key={key}
                          className={`group transition-colors ${
                            evalInfo.recommendDelete ? 'bg-rose-950/10 hover:bg-rose-950/20' : 'hover:bg-zinc-800/30'
                          }`}
                        >
                          <td className="py-3 px-4 max-w-[230px]">
                            <div className="font-medium text-white truncate" title={`Buka "${lead.name}" di Google Maps`}>
                              <a
                                href={mapsHref}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:text-indigo-300 hover:underline transition-colors"
                              >
                                {lead.name}
                              </a>
                            </div>
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              <span className="text-[11px] text-zinc-500 truncate max-w-[120px]">
                                {lead.categoryName || 'Bisnis Lokal'}
                              </span>
                              <span className="text-zinc-600">&bull;</span>
                              <span className="text-zinc-400 font-mono text-[10px]" title={`Waktu import: ${formatScrapedAt(lead.scrapedAt)}`}>
                                🕒 {formatScrapedAt(lead.scrapedAt)}
                              </span>
                              {evalInfo.recommendDelete ? (
                                <button
                                  type="button"
                                  onClick={() => setShowCleanupModal(true)}
                                  title={evalInfo.reasonTitle}
                                  className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-rose-950/60 text-rose-200 border border-rose-900/70 hover:border-rose-700"
                                >
                                  Hapus: {evalInfo.shortLabel}
                                </button>
                              ) : evalInfo.tier === 'PRIME' && !lead.aiResearch ? (
                                <span
                                  title={evalInfo.reasonTitle}
                                  className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-950/45 text-emerald-200 border border-emerald-900/60"
                                >
                                  Potensial
                                </span>
                              ) : null}
                            </div>
                          </td>

                          <td className="py-3 px-3 whitespace-nowrap">
                            {lead.rating ? (
                              <div className="flex items-center gap-1.5">
                                <span className="text-amber-400 font-medium">
                                  &#9733; {lead.rating}
                                </span>
                                <span className="text-[11px] text-zinc-500">
                                  ({lead.reviewCount || 0})
                                </span>
                              </div>
                            ) : (
                              <span className="text-zinc-600">-</span>
                            )}
                          </td>

                          <td className="py-3 px-4 max-w-[210px]">
                            <a
                              href={mapsHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-zinc-400 hover:text-zinc-200 truncate block transition-colors"
                              title={`Buka alamat di Google Maps: ${lead.address || '-'}`}
                            >
                              {lead.address || '-'}
                            </a>
                          </td>

                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="font-mono text-zinc-200">{lead.phone || '-'}</div>
                            {lead.whatsapp && lead.whatsapp !== lead.phone && (
                              <div className="font-mono text-zinc-400 text-[11px]">
                                WA: {lead.whatsapp}
                              </div>
                            )}
                          </td>

                          <td className="py-3 px-3 whitespace-nowrap">
                            {lead.website ? (
                              <a
                                href={lead.website}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`underline underline-offset-2 text-xs ${
                                  evalInfo.websiteType === 'FREE_BUILDER'
                                    ? 'text-amber-300 hover:text-amber-200'
                                    : 'text-emerald-300 hover:text-emerald-200 font-medium'
                                }`}
                              >
                                {evalInfo.websiteType === 'FREE_BUILDER'
                                  ? 'Web Gratisan'
                                  : 'Sudah Ada Web'}
                              </a>
                            ) : lead.websiteStatus === 'website_dead' || lead.deadWebsiteUrl ? (
                              <span
                                title={`Domain lama tidak aktif / 404: ${lead.deadWebsiteUrl || ''}`}
                                className="px-2 py-0.5 rounded-md text-[11px] bg-amber-950/60 text-amber-200 border border-amber-800/80 font-medium"
                              >
                                Domain Mati (404)
                              </span>
                            ) : lead.websiteStatus === 'social_only' || lead.socialMedia || lead.onlineShop ? (
                              <span className="px-2 py-0.5 rounded-md text-[11px] bg-sky-950/50 text-sky-200 border border-sky-800/70">
                                Hanya Sosmed/Olshop
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-md text-[11px] bg-zinc-900 text-zinc-400 border border-zinc-800">
                                Belum Ada Web
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-3 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              {lead.onlineShop && (
                                <a
                                  href={lead.onlineShop}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-2 py-0.5 rounded-md text-[11px] bg-zinc-900 text-zinc-300 border border-zinc-800 hover:border-zinc-600"
                                >
                                  {getShopLabel(lead.onlineShop)}
                                </a>
                              )}
                              {lead.socialMedia && (
                                <a
                                  href={lead.socialMedia}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-2 py-0.5 rounded-md text-[11px] bg-zinc-900 text-zinc-300 border border-zinc-800 hover:border-zinc-600"
                                >
                                  {getSocialLabel(lead.socialMedia)}
                                </a>
                              )}
                              {!lead.onlineShop && !lead.socialMedia && (
                                <span className="text-zinc-600">-</span>
                              )}
                            </div>
                          </td>

                          <td className="py-3 px-3 whitespace-nowrap">
                            {isAnalyzing ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-zinc-900 text-zinc-300 border border-zinc-700">
                                <span className="w-3 h-3 border-2 border-zinc-400/30 border-t-white rounded-full animate-spin" />
                                <span>Menganalisis...</span>
                              </span>
                            ) : lead.aiResearch ? (
                              <button
                                type="button"
                                onClick={() => setSelectedLeadId(lead.id)}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors inline-flex items-center gap-1.5 ${qualStyle.pill}`}
                                title="Klik untuk melihat detail riset & draft pesan WhatsApp"
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${qualStyle.dot}`} />
                                <span>{qual || 'WARM LEAD'}</span>
                                {typeof score === 'number' && (
                                  <span className="opacity-75 font-mono">&bull; {score}</span>
                                )}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleAnalyzeSingle(lead)}
                                className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 hover:border-zinc-500 transition-colors"
                              >
                                Analisis AI
                              </button>
                            )}
                          </td>

                          <td className="py-3 px-3 whitespace-nowrap">
                            {(() => {
                              const stKey = deriveLeadPipelineStage(lead);
                              const stMeta = PIPELINE_STAGES[stKey] || PIPELINE_STAGES.QUEUED;
                              return (
                                <div className="mb-1">
                                  <span
                                    title={stMeta.description}
                                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${stMeta.badgeClass}`}
                                  >
                                    <span className={`w-1.5 h-1.5 rounded-full ${stMeta.dotClass}`} />
                                    <span>{stMeta.label}</span>
                                  </span>
                                </div>
                              );
                            })()}
                            {lead.chatStatus === 'SUDAH' ? (
                              <button
                                type="button"
                                onClick={() => toggleChatStatus(lead)}
                                title="Klik untuk ubah kembali ke Belum Dichat"
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-emerald-950/60 text-emerald-300 border border-emerald-800/80 hover:border-emerald-600 transition-colors"
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                <span>Selesai (Dichat)</span>
                                {lead.contactedAt && (
                                  <span className="text-[10px] text-emerald-400/80 font-mono">
                                    {formatTimeOnly(lead.contactedAt)}
                                  </span>
                                )}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => toggleChatStatus(lead)}
                                title="Klik untuk tandai sudah dichat"
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border border-zinc-800 hover:border-zinc-700 transition-colors"
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
                                <span>Belum Dichat</span>
                              </button>
                            )}
                          </td>

                          <td
                            className={`py-3 px-4 text-right whitespace-nowrap sticky right-0 z-10 shadow-[-8px_0_12px_-4px_rgba(0,0,0,0.6)] border-l border-zinc-800/80 min-w-[190px] transition-colors ${
                              evalInfo.recommendDelete
                                ? 'bg-[#181215] group-hover:bg-[#20151a]'
                                : 'bg-[#121215] group-hover:bg-[#18181c]'
                            }`}
                          >
                            <div className="inline-flex items-center justify-end gap-1.5">
                              {waUrl ? (
                                <button
                                  type="button"
                                  onClick={() => handleOpenChat(lead, waUrl)}
                                  className="px-2.5 py-1 bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-1 shrink-0"
                                  title="Buka WhatsApp & otomatis tandai selesai dichat"
                                >
                                  <span>Chat WA</span>
                                  {lead.chatStatus === 'SUDAH' && (
                                    <span className="text-emerald-700 font-bold">&#10003;</span>
                                  )}
                                </button>
                              ) : (
                                <span className="text-zinc-600 text-xs px-2 shrink-0">-</span>
                              )}

                              <a
                                href={mapsHref}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-zinc-200 hover:text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/80 rounded-lg transition-colors shrink-0 shadow-sm"
                                title="Buka lokasi di Google Maps"
                              >
                                <svg className="w-3.5 h-3.5 text-rose-400 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z"/>
                                </svg>
                                <span>Maps</span>
                              </a>

                              <button
                                type="button"
                                disabled={isDeleting}
                                className="p-1.5 text-zinc-500 hover:text-rose-400 hover:bg-rose-950/30 rounded-lg transition-colors disabled:opacity-40 shrink-0"
                                onClick={() => handleDelete(lead)}
                                title="Hapus baris ini"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* PAGINATION FOOTER */}
            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1 text-xs text-zinc-400">
                <span>
                  Menampilkan {(safePage - 1) * PAGE_SIZE + 1} sampai{' '}
                  {Math.min(safePage * PAGE_SIZE, filteredLeads.length)} dari {filteredLeads.length} prospek
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Sebelumnya
                  </button>
                  <span className="px-3 py-1.5 font-mono text-zinc-300">
                    Hal {safePage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={safePage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Berikutnya
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </SectionErrorBoundary>

      {/* MODALS */}
      <SectionErrorBoundary title="Gagal memuat jendela pengaturan AI">
        {showAiSettingsModal && (
          <AiSettingsModal
            key={`settings-${aiSettings.primaryProvider}-${hasApiKey ? 'ready' : 'empty'}-${aiSettings.cloudDeepseekMask}-${aiSettings.cloudOpenrouterMask}`}
            settings={aiSettings}
            onClose={() => setShowAiSettingsModal(false)}
            onSave={handleSaveAiSettings}
          />
        )}
      </SectionErrorBoundary>

      <SectionErrorBoundary title="Gagal memuat jendela rekomendasi hapus">
        {showCleanupModal && (
          <CleanupRecommendationsModal
            key={`cleanup-${cleanupSummary.totalFlagged}`}
            groups={cleanupSummary.groups}
            onClose={() => setShowCleanupModal(false)}
            onConfirmDelete={executeBatchCleanupDelete}
          />
        )}
      </SectionErrorBoundary>

      <SectionErrorBoundary title="Gagal memuat detail riset AI">
        {selectedAiLead && (
          <AiLeadModal
            key={`lead-${selectedAiLead.id}-${selectedAiLead.aiResearch?.analyzedAt || 'init'}`}
            lead={selectedAiLead}
            aiSettings={aiSettings}
            isAnalyzing={analyzingIds.includes(String(selectedAiLead.id))}
            onClose={() => setSelectedLeadId(null)}
            onReanalyze={handleAnalyzeSingle}
            onSaveEditedPitch={handleSaveEditedPitch}
            normalizeWa={normalizeWa}
          />
        )}
      </SectionErrorBoundary>

      <ExtensionGuideModal
        open={showExtensionModal}
        onClose={() => setShowExtensionModal(false)}
      />
    </div>
  );
}
