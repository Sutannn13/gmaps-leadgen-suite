// Rationale: Unified multi-provider AI client (DeepSeek primary + OpenRouter Free fallback) with shared Neon DB key support, grounded lead analysis prompting, and deterministic anti-AI-slop text humanizer.

import { classifyWebsiteUrl, evaluateLeadQualification } from './leadQualification.js';

export const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
export const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
export const DEEPSEEK_PROXY_URL = '/api/ai/deepseek';
export const OPENROUTER_PROXY_URL = '/api/ai/openrouter';
export const MUSE_RESEARCH_PROXY_URL = '/api/ai/muse-research';
export const MUSE_SCRAPE_PROXY_URL = '/api/ai/muse-scrape';

export const DEFAULT_OPENROUTER_MODEL = 'openrouter/free';
export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-chat';
export const DEFAULT_MUSE_MODEL = 'muse.ai/vm-scrapling';

export const AI_SETTINGS_STORAGE_KEY = 'gmaps_leadgen_ai_settings_v2';
const LEGACY_OPENROUTER_STORAGE_KEY = 'gmaps_leadgen_openrouter_v1';

export const DEEPSEEK_MODELS = [
  {
    id: 'deepseek-chat',
    name: 'DeepSeek V3 (deepseek-chat: Cepat & JSON Stabil)',
  },
  {
    id: 'deepseek-reasoner',
    name: 'DeepSeek R1 (deepseek-reasoner: Deep Thinking)',
  },
];

export const FALLBACK_FREE_MODELS = [
  {
    id: 'openrouter/free',
    name: 'OpenRouter Free Auto-Router (Direkomendasikan)',
    contextLength: 128000,
  },
  {
    id: 'google/gemma-3-27b-it:free',
    name: 'Google: Gemma 3 27B IT (Free)',
    contextLength: 131072,
  },
  {
    id: 'meta-llama/llama-3.3-70b-instruct:free',
    name: 'Meta: Llama 3.3 70B Instruct (Free)',
    contextLength: 128000,
  },
  {
    id: 'deepseek/deepseek-chat-v3-0324:free',
    name: 'DeepSeek: Chat V3 via OpenRouter (Free)',
    contextLength: 128000,
  },
  {
    id: 'qwen/qwen3-32b:free',
    name: 'Qwen: Qwen3 32B (Free)',
    contextLength: 40960,
  },
];

export const DEFAULT_AGENCY_NAME = 'Tim Developer KodeKiri';
export const DEFAULT_AGENCY_WEBSITE = 'https://kodekiri.tech';

export const DEFAULT_AI_SETTINGS = {
  primaryProvider: 'muse', // 'muse' | 'deepseek' | 'openrouter'
  autoFallback: true,
  museBridgeReady: true,
  deepseekApiKey: '',
  deepseekModel: DEFAULT_DEEPSEEK_MODEL,
  openrouterApiKey: '',
  openrouterModel: DEFAULT_OPENROUTER_MODEL,
  agencyName: DEFAULT_AGENCY_NAME,
  agencyWebsite: DEFAULT_AGENCY_WEBSITE,
  serviceFocus: 'Pembuatan Website Katalog, Company Profile & Landing Page SEO Lokal',
  pitchTone: 'casual', // 'casual' | 'formal' | 'consultative'
  cloudDeepseekReady: false,
  cloudDeepseekMask: '',
  cloudOpenrouterReady: false,
  cloudOpenrouterMask: '',
};

export class OpenRouterClientError extends Error {
  constructor(
    message,
    { code = 'AI_CLIENT_ERROR', status = 0, retryable = false, provider = '' } = {}
  ) {
    super(message);
    this.name = 'OpenRouterClientError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
    this.provider = provider;
  }
}

export function isMuseConfigured(settings = {}) {
  return settings?.museBridgeReady !== false;
}

export function isDeepSeekConfigured(settings = {}) {
  return Boolean(String(settings.deepseekApiKey || '').trim() || settings.cloudDeepseekReady);
}

export function isOpenRouterConfigured(settings = {}) {
  return Boolean(String(settings.openrouterApiKey || '').trim() || settings.cloudOpenrouterReady);
}

export function isAnyAiConfigured(settings = {}) {
  return (
    isMuseConfigured(settings) ||
    isDeepSeekConfigured(settings) ||
    isOpenRouterConfigured(settings)
  );
}

export function isZeroCostModel(model) {
  if (!model || typeof model.id !== 'string') return false;
  const id = model.id.trim();
  if (id === DEFAULT_OPENROUTER_MODEL) return true;
  if (!id.endsWith(':free')) return false;

  const promptCost = Number(model.pricing?.prompt ?? NaN);
  const completionCost = Number(model.pricing?.completion ?? NaN);
  const requestCost = Number(model.pricing?.request ?? 0);

  return promptCost === 0 && completionCost === 0 && requestCost === 0;
}

export function ensureFreeModelId(modelId) {
  const clean = typeof modelId === 'string' ? modelId.trim() : '';
  if (clean === DEFAULT_OPENROUTER_MODEL || clean.endsWith(':free')) {
    return clean;
  }
  return DEFAULT_OPENROUTER_MODEL;
}

export function ensureDeepSeekModelId(modelId) {
  const clean = typeof modelId === 'string' ? modelId.trim() : '';
  return clean === 'deepseek-reasoner' ? 'deepseek-reasoner' : DEFAULT_DEEPSEEK_MODEL;
}

export function filterFreeModels(rawModels = []) {
  const map = new Map();
  map.set(DEFAULT_OPENROUTER_MODEL, {
    id: DEFAULT_OPENROUTER_MODEL,
    name: 'OpenRouter Free Auto-Router (Direkomendasikan)',
    contextLength: 128000,
  });

  if (Array.isArray(rawModels)) {
    for (const item of rawModels) {
      if (!isZeroCostModel(item)) continue;
      const id = item.id.trim();
      if (id === DEFAULT_OPENROUTER_MODEL) continue;
      map.set(id, {
        id,
        name: (item.name || id).trim(),
        contextLength: Number(item.context_length) || 0,
      });
    }
  }

  const [autoRouter, ...rest] = Array.from(map.values());
  rest.sort((a, b) => a.name.localeCompare(b.name));
  return [autoRouter, ...rest];
}

export async function fetchFreeOpenRouterModels(
  apiKey = '',
  { signal, fetchImpl = globalThis.fetch, timeoutMs = 12000 } = {}
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  if (signal) signal.addEventListener('abort', onAbort, { once: true });

  try {
    const headers = { Accept: 'application/json' };
    if (apiKey && apiKey.trim()) {
      headers.Authorization = `Bearer ${apiKey.trim()}`;
    }

    const res = await fetchImpl(OPENROUTER_MODELS_URL, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const payload = await res.json();
    const models = filterFreeModels(payload?.data || []);
    return {
      models: models.length > 1 ? models : FALLBACK_FREE_MODELS,
      fromFallback: models.length <= 1,
    };
  } catch (err) {
    return {
      models: FALLBACK_FREE_MODELS,
      fromFallback: true,
      warning: err?.message || 'Gagal memuat daftar model live, menggunakan daftar bawaan.',
    };
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

// Deterministic humanizer: strips emojis, double dashes (--), em/en-dashes, while preserving single hyphens in Indonesian reduplicated words (e.g. produk-produk, rata-rata).
export function humanizeGeneratedText(input) {
  const raw = String(input ?? '');
  if (!raw.trim()) return '';

  return raw
    .replace(/[\p{Extended_Pictographic}\uFE0F]/gu, '')
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/\s*(?:--+|\u2014|\u2015)\s*/g, ', ')
        .replace(/\s+[\u2013-]\s+/g, ', ')
        .replace(/([.!?:])\s*,\s*/g, '$1 ')
        .replace(/,\s*,+/g, ',')
        .replace(/^,\s*/, '')
        .replace(/\s*,\s*([.!?])/g, '$1')
        .replace(/[ \t]{2,}/g, ' ')
        .trim()
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractFirstJsonObject(text) {
  const cleaned = String(text || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  const start = cleaned.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return cleaned.slice(start, i + 1);
      }
    }
  }

  return null;
}

export function extractBusinessIdentity(rawName = '', categoryName = '', address = '') {
  const fullRaw = String(rawName || '').trim();
  const catRaw = String(categoryName || '').trim();
  const addrRaw = String(address || '').trim();

  // Split SEO-stuffed titles like "Ofcourse.apparel | Jasa Sablon DTF dan Plastisol Terdekat Di Depok | Sablon Kaos Satuan"
  const segments = fullRaw
    .split(/\s*(?:\||\/|\u2022|\u00b7|\s+[\u2013\u2014-]\s+)\s*/)
    .map((s) => s.trim())
    .filter(Boolean);

  let primarySegment = segments[0] || fullRaw || 'Kakak';

  // Convert dot-separated brand handles like "Ofcourse.apparel" -> "Ofcourse Apparel"
  if (/^[a-z0-9]+(?:\.[a-z0-9]+)+$/i.test(primarySegment) && !/\.(?:com|id|co\.id|net|org|tech)$/i.test(primarySegment)) {
    primarySegment = primarySegment
      .split('.')
      .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : ''))
      .join(' ');
  }

  // Strip awkward generic prefix "Toko " only when the remaining name still has >= 3 meaningful words (e.g. "Toko Sablon Kaos Kaffah Depok" -> "Sablon Kaos Kaffah Depok")
  const withoutToko = primarySegment.replace(/^toko\s+/i, '').trim();
  const cleanBrandName =
    withoutToko.split(/\s+/).filter(Boolean).length >= 3 ? withoutToko : primarySegment;

  // Extract specialty from extra SEO segments if present
  const extraSegments = segments
    .slice(1)
    .map((seg) =>
      seg
        .replace(/\b(?:terdekat|termurah|murah|terbaik|terpercaya|no\.?\s*1)\b/gi, '')
        .replace(/\bdi\s+[a-z\s]+$/i, '')
        .replace(/\s{2,}/g, ' ')
        .replace(/^[,\s-]+|[,\s-]+$/g, '')
        .trim()
    )
    .filter((seg) => seg.length >= 3);

  const extractedSpecialty = extraSegments.slice(0, 2).join(', ');
  const combinedContext = `${fullRaw} ${catRaw} ${extractedSpecialty}`.toLowerCase();

  let nicheBucket = 'RITEL_UMUM';
  if (/\b(?:sablon|konveksi|apparel|kaos|jersey|bordir|percetakan|printing|custom|distro|garment)\b/i.test(combinedContext)) {
    nicheBucket = 'SABLON_KONVEKSI';
  } else if (/\b(?:kopi|coffee|cafe|kafe|resto|restoran|kuliner|katering|catering|roti|bakery|kue|warung|makan|dimsum|ayam|bakso|mie|seblak|minuman)\b/i.test(combinedContext)) {
    nicheBucket = 'KULINER';
  } else if (/\b(?:bengkel|servis|service|ac|mobil|motor|las|kanopi|konstruksi|interior|tukang|laundry|cuci|ekspedisi|rental|sewa)\b/i.test(combinedContext)) {
    nicheBucket = 'JASA_SERVIS';
  } else if (/\b(?:klinik|salon|barbershop|spa|kecantikan|dental|gigi|dokter|apotek|terapi|studio\s*foto|gym|fitness)\b/i.test(combinedContext)) {
    nicheBucket = 'KLINIK_KECANTIKAN';
  }

  const nicheMap = {
    SABLON_KONVEKSI: {
      valuePropLabel: 'website katalog produk, info jenis bahan dan sablon, serta cara order ke WhatsApp',
      opportunityDefault: 'Website Katalog & Order Sablon WA',
      qualificationQuestion:
        'jenis sablon atau pesanan apa yang paling sering masuk (misal lusinan komunitas atau satuan), sama apakah Kakak ada logo atau foto hasil sablon yang mau sekalian ditampilkan',
    },
    KULINER: {
      valuePropLabel: 'website daftar menu, info paket pesanan, dan tombol pesan langsung ke WhatsApp',
      opportunityDefault: 'Website Menu & Order WhatsApp',
      qualificationQuestion:
        'menu atau paket apa yang paling sering dipesan pelanggan, sama apakah Kakak ada logo atau foto menu yang mau sekalian ditampilkan',
    },
    JASA_SERVIS: {
      valuePropLabel: 'website info layanan, estimasi biaya, dan tombol booking jadwal ke WhatsApp',
      opportunityDefault: 'Website Info Layanan & Booking WA',
      qualificationQuestion:
        'layanan servis apa yang paling sering ditanyakan pelanggan di WA, sama apakah Kakak ada logo atau foto pengerjaan yang mau sekalian ditampilkan',
    },
    KLINIK_KECANTIKAN: {
      valuePropLabel: 'website daftar treatment, pricelist layanan, dan tombol reservasi ke WhatsApp',
      opportunityDefault: 'Website Katalog Treatment & Reservasi WA',
      qualificationQuestion:
        'layanan atau treatment apa yang paling sering dipesan pelanggan, sama apakah Kakak ada logo atau foto tempat yang mau sekalian ditampilkan',
    },
    RITEL_UMUM: {
      valuePropLabel: 'website katalog produk resmi dan info pemesanan yang terhubung ke WhatsApp',
      opportunityDefault: 'Website Katalog & Order WA',
      qualificationQuestion:
        'produk atau layanan utama apa yang paling sering dicari pelanggan, sama apakah Kakak ada logo atau foto produk yang mau sekalian ditampilkan',
    },
  };

  const nicheMeta = nicheMap[nicheBucket] || nicheMap.RITEL_UMUM;

  return {
    rawName: fullRaw,
    cleanBrandName,
    extractedSpecialty,
    categoryName: catRaw || 'Usaha Lokal',
    address: addrRaw,
    nicheBucket,
    valuePropLabel: nicheMeta.valuePropLabel,
    opportunityDefault: nicheMeta.opportunityDefault,
    qualificationQuestion: nicheMeta.qualificationQuestion,
  };
}

export function resolveAgencyName(rawAgencyName) {
  const clean = String(rawAgencyName || '').trim();
  if (!clean || clean.toLowerCase() === 'tim web developer') {
    return DEFAULT_AGENCY_NAME;
  }
  return clean;
}

export function buildDefaultWaPitch(lead = {}, settings = DEFAULT_AI_SETTINGS) {
  const identity = extractBusinessIdentity(
    lead.name,
    lead.categoryName || lead.category,
    lead.address
  );
  const agencyName = resolveAgencyName(settings?.agencyName);
  const specialtyPhrase = identity.extractedSpecialty
    ? ` untuk layanan ${identity.extractedSpecialty.toLowerCase()}`
    : '';

  // English pitch for international prospects
  if (lead.language === 'en' || lead.geoScope === 'INTERNATIONAL') {
    const hasReviews = Boolean(lead.reviewCount && parseInt(String(lead.reviewCount).replace(/[^\d]/g, ''), 10) > 0);
    const reviewPhrase = hasReviews ? ' and noticed your positive customer reviews' : '';
    const businessContext = identity.extractedSpecialty
      ? ` your ${identity.extractedSpecialty.toLowerCase()} offerings`
      : ` your ${identity.categoryName.toLowerCase()} business`;

    const enDraft = `Hi there, reaching out from ${agencyName}. We came across ${identity.cleanBrandName}${reviewPhrase} and wanted to learn more about${businessContext}. Quick question: do you currently have a dedicated one-page portfolio or catalog website for direct inquiries, or are you primarily handling orders through social media and messaging? If you would be open to it, our team would love to build a quick, free preview of a clean one-page web catalog for ${identity.cleanBrandName} (zero commitment required). Would it be okay if we put a draft together for you to see?`;
    return humanizeGeneratedText(enDraft);
  }

  const draft = `Halo Kak, admin ${identity.cleanBrandName} ya? Salam kenal dari ${agencyName}. Kami lihat profil usaha Kakak di Google Maps sudah punya ulasan bagus${specialtyPhrase}, namun belum mencantumkan ${identity.valuePropLabel}. Boleh kami coba buatkan gambaran tampilan web singkat khusus untuk ${identity.cleanBrandName} Kak? Kalau belum butuh saat ini santai saja, abaikan tidak apa-apa.`;

  return humanizeGeneratedText(draft);
}

export function buildQualificationReplyDraft(lead = {}, settings = DEFAULT_AI_SETTINGS) {
  const identity = extractBusinessIdentity(
    lead.name,
    lead.categoryName || lead.category,
    lead.address
  );
  const agencyWebsite = String(settings?.agencyWebsite || DEFAULT_AGENCY_WEBSITE).trim();

  if (lead.language === 'en' || lead.geoScope === 'INTERNATIONAL') {
    const enReply = `Thank you! In the meantime, you can review our team profile and portfolio at ${agencyWebsite}. To tailor the one-page mockup specifically for ${identity.cleanBrandName}, could you let us know what your most requested product or service is, and whether you have a logo or photos you would like us to include? We will prepare the design preview so you can see if it fits. Zero commitment required.`;
    return humanizeGeneratedText(enReply);
  }

  const reply = `Siap Kak, terima kasih. Sambil jalan, profil dan portofolio tim kami bisa dicek di ${agencyWebsite} ya Kak.

Biar contoh tampilan webnya nanti benar-benar pas sama usaha ${identity.cleanBrandName}, boleh minta info dikit ya Kak: ${identity.qualificationQuestion}?

Nanti kami bikinin dulu gambaran tampilannya, Kakak tinggal cek cocok atau nggak. Santai aja, nggak ada kewajiban lanjut kalau belum cocok.`;

  return humanizeGeneratedText(reply);
}

export function buildMockupDeliveryDraft(lead = {}, shareUrl = '', settings = DEFAULT_AI_SETTINGS) {
  const identity = extractBusinessIdentity(
    lead.name,
    lead.categoryName || lead.category,
    lead.address
  );
  const cleanUrl = String(shareUrl || '').trim() || '[Tempel Link muse.ai/s/mockup-... di sini]';

  const delivery = `Halo Kak, ini gambaran tampilan website singkat untuk ${identity.cleanBrandName} yang sudah kami sesuaikan: ${cleanUrl}

Saat ini masih dalam Mode Pratinjau Desain oleh Tim Developer KodeKiri. Kalau tampilannya sudah cocok, nanti bisa kami aktifkan katalog penuhnya beserta domain resmi sendiri. Menurut Kakak gimana untuk tampilan awalnya?`;

  return humanizeGeneratedText(delivery);
}

export function buildMuseMockupBridgePrompt(
  lead = {},
  mockupOptions = {},
  settings = DEFAULT_AI_SETTINGS
) {
  const identity = extractBusinessIdentity(
    lead.name,
    lead.categoryName || lead.category,
    lead.address
  );
  const agencyName = resolveAgencyName(settings?.agencyName);
  const agencyWebsite = String(settings?.agencyWebsite || DEFAULT_AGENCY_WEBSITE).trim();
  const clientNotes = String(mockupOptions?.clientNotes || lead?.aiResearch?.museClientNotes || '').trim();
  const referenceUrl = String(mockupOptions?.referenceUrl || lead?.aiResearch?.museReferenceUrl || '').trim();
  const waNumber = String(lead.whatsapp || lead.phone || '').trim();

  return `TUGAS UTAMA MUSE.AI:
Buat 1 halaman Landing Page Pratinjau (Single-Page Preview Mockup) berdesain PREMIUM (Anti-AI-Slop) untuk prospek usaha lokal berikut.

1. DATA FAKTA USAHA TARGET (SUMBER KEBENARAN TUNGGAL):
- Nama Brand Bersih: ${identity.cleanBrandName} (Nama mentah Maps: ${identity.rawName || '-'})
- Kategori / Niche: ${identity.categoryName} (${identity.nicheBucket})
- Spesialisasi Layanan dari Maps: ${identity.extractedSpecialty || 'Sesuai kategori usaha'}
- Alamat Asli: ${identity.address || 'Depok / Kabupaten Bogor'}
- Reputasi Google Maps: Rating ${lead.rating || '4.8'} bintang (${lead.reviewCount || 'puluhan'} ulasan pelanggan)
- Nomor WhatsApp Usaha: ${waNumber || 'Gunakan tombol simulasi order WA'}
- Sosmed / Marketplace Tercantum: ${[lead.socialMedia, lead.onlineShop].filter(Boolean).join(', ') || 'Belum dicantumkan'}
- DETAIL DARI BALASAN CHAT WA KLIEN (PRIORITAS UTAMA): ${clientNotes || 'Tonjolkan layanan utama sesuai spesialisasi Maps di atas dan sediakan slot logo usaha.'}

2. INSTRUKSI REVERSE-ENGINEER DESAIN PREMIUM (SKILL: reverse-engineer-anything + deanchor + frontend-design):
${
  referenceUrl
    ? `- URL Website Referensi Target: ${referenceUrl}
- Lakukan reverse-engineering HANYA pada arsitektur visual, sistem grid, tipografi display vs body, ritme whitespace, dan gaya komponen dari referensi tersebut.`
    : `- Pilih standar desain landing page terbaik dan paling kredibel untuk kategori ${identity.categoryName} (bukan template AI generik).`
}
- ANTI-AI-SLOP WAJIB: Dilarang membuat gradien ungu-biru generik, kartu 3 kolom simetris membosankan, atau kalimat robotik klise ("Solusi Terbaik Terpercaya di Era Digital").
- AKSESIBILITAS & MOBILE-FIRST (SKILL: superior-accessibility): 95% pemilik usaha membuka link ini dari WhatsApp di layar HP. Pastikan tata letak mobile-first, tanpa horizontal overflow, ukuran tombol nyaman disentuh, dan rasio kontras teks minimal 4.5:1.

3. INSTRUKSI MARKETING & COPYWRITING LOKAL (SKILL: marketingskills/cro + copywriting + humanizer):
${
  lead.language === 'en' || lead.geoScope === 'INTERNATIONAL'
    ? `- COPYWRITING LANGUAGE: STRICT ENGLISH ONLY. Use clear, direct B2B copywriting emphasizing product quality and direct communication.`
    : `- Gunakan bahasa Indonesia yang natural, langsung ke manfaat nyata, dan akrab bagi pelanggan di area ${identity.address || 'Depok/Bogor'}.`
}
- Jangan gunakan tanda double dash (--) atau em-dash.

4. GERBANG AUDIT WAJIB: CROSS-CHECK ANTI-DUMMY & ANTI-BOCORAN REFERENSI (WAJIB DICEK SEBELUM SELESAI):
- [CEK 1 - ZERO REFERENCE LEAK]: Pastikan TIDAK ADA satu kata pun nama brand, logo, hak cipta, atau gambar produk dari website referensi yang terbawa ke hasil akhir. Semua harus milik "${identity.cleanBrandName}".
- [CEK 2 - ZERO DUMMY ADDRESS/CONTACT]: Pastikan alamat dan kontak yang tampil adalah "${identity.address || 'Depok / Bogor'}", BUKAN alamat palsu seperti "Jl. Sudirman Jakarta" atau nomor dummy "0812-3456-7890".
- [CEK 3 - ZERO FABRICATED PRICING]: DILARANG KERAS mengarang angka harga Rupiah (seperti "Mulai Rp 15.000") kecuali tertulis eksplisit di Detail Balasan Klien di atas. Untuk harga, gunakan tombol "Cek Estimasi Harga Sesuai Pesanan via WhatsApp".
- [CEK 4 - ZERO FAKE TESTIMONIALS]: Gunakan fakta rating Google Maps asli (${lead.rating || '4.8'}/5.0 dari ${lead.reviewCount || 'pelanggan'} ulasan), jangan mengarang kutipan testimoni palsu dengan nama fiktif.

5. BATASAN KETAT SCOPE MOCKUP (PREVIEW LOCK KODEKIRI - JANGAN BUAT FULL WEBSITE):
- Buat HANYA 1 halaman pratinjau yang terdiri dari MAKSIMAL 4 SECTION:
  (a) Sticky Top Banner Pratinjau: "Mode Pratinjau Desain oleh ${agencyName} (${agencyWebsite}) - Domain resmi & katalog penuh diaktifkan setelah rilis."
  (b) Hero Section Spesifik "${identity.cleanBrandName}" + Tombol Utama Simulasi Order WhatsApp.
  (c) Section Layanan Utama: Tampilkan 3 kartu layanan nyata toko + 1 kartu terkunci bertuliskan "Slot Katalog Produk Penuh & Kalkulator Estimasi Order (Aktif di Versi Resmi)".
  (d) Section Bukti Reputasi Google Maps + Lokasi + Simulasi CTA WhatsApp (ketika tombol order diklik, tampilkan preview format chat order WA yang rapi).`;
}

export function parseAiResearchResponse(
  rawContent,
  modelUsed = DEFAULT_DEEPSEEK_MODEL,
  lead = null,
  settings = DEFAULT_AI_SETTINGS
) {
  const jsonStr = extractFirstJsonObject(rawContent);
  if (!jsonStr) {
    throw new OpenRouterClientError(
      `Model (${modelUsed}) tidak mengembalikan format JSON yang valid. Coba analisis ulang.`,
      { code: 'INVALID_AI_JSON', retryable: true }
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new OpenRouterClientError(
      `Gagal mengurai respons JSON dari model (${modelUsed}). Coba analisis ulang.`,
      { code: 'INVALID_AI_JSON', retryable: true }
    );
  }

  const qualUpper = String(parsed.leadQualification || 'WARM LEAD').toUpperCase().trim();
  const leadQualification = qualUpper.includes('HOT')
    ? 'HOT LEAD'
    : qualUpper.includes('COLD')
      ? 'COLD LEAD'
      : 'WARM LEAD';

  const defaultScore =
    leadQualification === 'HOT LEAD' ? 85 : leadQualification === 'COLD LEAD' ? 28 : 60;
  const rawScore = Number(parsed.leadScore);
  const leadScore = Number.isFinite(rawScore)
    ? Math.max(0, Math.min(100, Math.round(rawScore)))
    : defaultScore;

  const digitalPresenceSummary = humanizeGeneratedText(parsed.digitalPresenceSummary);
  const pitchDraft = humanizeGeneratedText(parsed.pitchDraft);

  if (!digitalPresenceSummary || !pitchDraft) {
    throw new OpenRouterClientError(
      `Respons model (${modelUsed}) belum lengkap (ringkasan atau draft pesan kosong).`,
      { code: 'INCOMPLETE_AI_JSON', retryable: true }
    );
  }

  const fallbackQualReply = lead ? buildQualificationReplyDraft(lead, settings) : '';
  const qualificationReplyDraft =
    humanizeGeneratedText(parsed.qualificationReplyDraft) || fallbackQualReply;

  return {
    leadQualification,
    leadScore,
    hasOfficialWebsite: Boolean(parsed.hasOfficialWebsite === true),
    opportunityType:
      humanizeGeneratedText(parsed.opportunityType) || 'Pembuatan Website Katalog Mandiri',
    digitalPresenceSummary,
    pitchAngle: humanizeGeneratedText(parsed.pitchAngle),
    pitchDraft,
    qualificationReplyDraft,
    followUpDraft: humanizeGeneratedText(parsed.followUpDraft),
    museClientNotes: String(parsed.museClientNotes || '').trim(),
    museReferenceUrl: String(parsed.museReferenceUrl || '').trim(),
    museShareUrl: String(parsed.museShareUrl || '').trim(),
    modelUsed: String(modelUsed || DEFAULT_DEEPSEEK_MODEL).trim(),
    analyzedAt: new Date().toISOString(),
  };
}

export function buildLeadPrompt(lead, settings = DEFAULT_AI_SETTINGS) {
  const agencyName = resolveAgencyName(settings?.agencyName);
  const agencyWebsite = String(settings?.agencyWebsite || DEFAULT_AGENCY_WEBSITE).trim();
  const identity = extractBusinessIdentity(
    lead?.name,
    lead?.categoryName || lead?.category,
    lead?.address
  );

  const toneGuide =
    settings.pitchTone === 'formal'
      ? 'sopan, ringkas, dan profesional ala komunikasi bisnis Indonesia ke pemilik usaha, tanpa terdengar kaku seperti surat resmi'
      : settings.pitchTone === 'consultative'
        ? 'konsultatif berbasis fakta ulasan dan kanal online yang tertera, fokus menawarkan diskusi singkat yang relevan'
        : 'akrab, santai, dan wajar seperti chat WhatsApp asli dari manusia di Indonesia (sapaan Kak atau Admin sesuai jenis usaha)';

  const webType = classifyWebsiteUrl(lead.website);
  let websiteContext = 'BELUM PUNYA WEBSITE RESMI';
  if (webType === 'OWNED_DOMAIN') {
    websiteContext = `SUDAH PUNYA DOMAIN MANDIRI (${lead.website})`;
  } else if (webType === 'FREE_BUILDER') {
    websiteContext = `MASIH PAKAI SUBDOMAIN GRATISAN (${lead.website}, belum punya domain resmi sendiri)`;
  } else if (lead.website) {
    websiteContext = `Tautan tercantum bukan website resmi (${lead.website})`;
  }

  // Literal word "json" included intentionally to satisfy DeepSeek strict JSON Output mode requirement.
  const systemPrompt = `Kamu adalah Analis Kualifikasi Prospek B2B dan Penulis Pesan WhatsApp untuk "${agencyName}" (${agencyWebsite}).
Fokus layanan yang kamu tawarkan: ${settings.serviceFocus || DEFAULT_AI_SETTINGS.serviceFocus}.
Target klien utama kami HANYA bisnis aktif yang BELUM memiliki website berdomain resmi sendiri.

ATURAN FAKTA DAN ANTI-HALUSINASI (WAJIB DIPATUHI):
1. Analisis HANYA berdasarkan data Google Maps yang diberikan. Jangan pernah mengarang akun Instagram, Shopee, jumlah pengikut, cabang, atau klaim apa pun yang tidak tertulis di input.
2. Jika kolom sosial media atau marketplace tertulis kosong, nyatakan secara jujur bahwa tautan tersebut belum tercantum di profil Maps mereka.

KRITERIA PENILAIAN OBJEKTIF:
1. HOT LEAD (skor 75 sampai 95): Bisnis lokal aktif yang belum punya domain resmi (termasuk yang masih memakai Linktree, Blogspot, Canva, Instagram, atau Shopee), memiliki reputasi ulasan sehat di Maps, dan punya kontak yang bisa dihubungi.
2. WARM LEAD (skor 45 sampai 74): Bisnis lokal tanpa website resmi yang memiliki kontak, namun jumlah ulasan masih sedikit sehingga skala usahanya masih berkembang.
3. COLD LEAD (skor 0 sampai 39): Bisnis yang SUDAH punya website berdomain resmi mandiri, jaringan franchise korporat besar, instansi pemerintah/publik, toko tutup, atau tidak punya jalur kontak sama sekali. Set "hasOfficialWebsite": true jika mereka memang sudah punya domain mandiri.

ATURAN PEMBERSIHAN NAMA USAHA & KONTEKS LAYANAN (PENTING):
1. Jika nama usaha di Google Maps mengandung kata kunci SEO panjang atau garis pemisah (contoh: "Ofcourse.apparel | Jasa Sablon DTF dan Plastisol Terdekat Di Depok | Sablon Kaos Satuan"), JANGAN menyalin judul panjang itu mentah-mentah ke sapaan chat.
2. Gunakan Nama Panggilan Bersih ("${identity.cleanBrandName}") saat menyapa di pesan WhatsApp, dan masukkan informasi layanan spesifiknya ("${identity.extractedSpecialty || identity.categoryName}") secara alami di dalam kalimat pujian/pengamatan.
3. Sesuaikan istilah website dengan jenis usahanya (${identity.valuePropLabel}), jangan memukul rata semua jenis usaha sebagai "website katalog" jika usahanya adalah bengkel atau jasa servis.

ATURAN GAYA BAHASA HUMANIZER & FUNNEL OUTREACH (ANTI GAYA AI & ANTI BLUNDER):
1. DILARANG KERAS menggunakan tanda double dash (--), em-dash, maupun tanda strip pemisah kalimat ( - ). Gunakan koma atau titik biasa saja.
2. DILARANG menggunakan emoji apa pun, daftar poin/bullet list di dalam pesan chat, atau tanda seru berlebihan.
3. DILARANG menggunakan kalimat klise terjemahan AI seperti: "Di era digital saat ini", "Semoga pesan ini menemui Anda dalam keadaan baik", "Meningkatkan visibilitas secara signifikan", "Solusi terpadu", "Transformasi digital", "Tak dapat dipungkiri", atau "Jangan lewatkan kesempatan".
4. Panjang "pitchDraft" (Chat 1 Pembuka) maksimal 45 sampai 60 kata (3 sampai 4 kalimat pendek agar nyaman dibaca sekali lihat di layar HP). Gaya bahasa: ${toneGuide}.
5. Susunan alami "pitchDraft" (Chat 1 Pembuka):
   a. Sapaan singkat yang wajar ke admin "${identity.cleanBrandName}" dan perkenalkan diri dari "${agencyName}" (JANGAN menaruh link URL hidup di Chat 1 karena link di pesan pertama dari nomor baru tidak bisa diklik di WhatsApp).
   b. Satu pengamatan spesifik dari data Maps mereka (ulasan bagus, layanan "${identity.extractedSpecialty || identity.categoryName}", namun belum mencantumkan ${identity.valuePropLabel}).
   c. Tawarkan izin untuk membuatkan gambaran tampilan web singkat khusus untuk "${identity.cleanBrandName}" (gunakan kata "buatkan gambaran tampilan singkat", JANGAN gunakan kalimat ambigu "kirimkan contoh katalognya" agar klien tidak salah paham mengira katalog produk mereka sudah jadi).
   d. Satu kalimat penutup ringan tanpa paksaan (kalau belum butuh saat ini santai saja, abaikan tidak apa-apa).
6. Susunan "qualificationReplyDraft" (Chat 2 saat klien membalas "Boleh"):
   a. Ucapkan terima kasih singkat dan cantumkan link portofolio resmi ${agencyWebsite} (karena di Chat 2 link WhatsApp sudah aktif bisa diklik).
   b. Tanyakan secara sopan: ${identity.qualificationQuestion}, supaya contoh tampilan web yang dibuatkan benar-benar sesuai dengan usaha mereka dan tanpa kewajiban lanjut jika belum cocok.
7. Panjang "followUpDraft" maksimal 25 kata, sopan menanyakan apakah gambaran tampilan web untuk ${identity.cleanBrandName} boleh kami coba buatkan, tanpa memaksa.

Balas HANYA dalam format json objek murni yang valid tanpa markdown backticks:
{
  "leadQualification": "HOT LEAD" | "WARM LEAD" | "COLD LEAD",
  "leadScore": 85,
  "hasOfficialWebsite": false,
  "opportunityType": "${identity.opportunityDefault}",
  "digitalPresenceSummary": "2 kalimat analisis tajam dan faktual mengenai kondisi digital usaha ini beserta alasan skornya, tanpa tanda -- atau em-dash.",
  "pitchAngle": "1 kalimat alasan bisnis paling relevan kenapa usaha ini terbantu jika punya website resmi sendiri.",
  "pitchDraft": "Pesan WhatsApp pertama (Chat 1) atas nama ${agencyName} untuk ${identity.cleanBrandName}, 45 sampai 60 kata, tanpa URL hidup dan tanpa tanda -- atau em-dash.",
  "qualificationReplyDraft": "Pesan balasan (Chat 2) saat klien menjawab Boleh, mencantumkan ${agencyWebsite} dan menanyakan layanan utama serta logo/foto sebelum dibuatkan pratinjau web.",
  "followUpDraft": "Pesan sapaan tindak lanjut hari ke-3 yang singkat dan sopan, tanpa tanda -- atau em-dash."
}`;

  const userPrompt = `Analisis prospek Google Maps berikut secara objektif dan kembalikan hasil dalam json:
Nama Mentah di Google Maps: ${lead.name || '-'}
Nama Panggilan Bersih (Gunakan di Chat): ${identity.cleanBrandName}
Spesialisasi Layanan Terdeteksi dari Judul: ${identity.extractedSpecialty || 'Sesuai kategori usaha'}
Kategori Usaha: ${lead.categoryName || lead.category || 'Usaha Lokal'}
Istilah Website yang Cocok: ${identity.valuePropLabel}
Alamat: ${lead.address || '-'}
Rating Google Maps: ${lead.rating ? `${lead.rating} dari 5.0` : 'Belum ada rating'} (${lead.reviewCount || 0} ulasan)
Status Website di Maps: ${websiteContext}
Tautan Sosial Media di Maps: ${lead.socialMedia || 'Belum tercantum'}
Tautan Marketplace di Maps: ${lead.onlineShop || 'Belum tercantum'}
Kontak Telepon / WA: ${lead.whatsapp || lead.phone || 'Tidak tersedia'}`;

  return { systemPrompt, userPrompt };
}

export async function analyzeLeadWithDeepSeek(
  lead,
  rawSettings = {},
  { signal, fetchImpl = globalThis.fetch, timeoutMs = 45000 } = {}
) {
  const settings = { ...DEFAULT_AI_SETTINGS, ...rawSettings };
  const apiKey = String(settings.deepseekApiKey || settings.apiKey || '').trim();

  if (!apiKey && !settings.cloudDeepseekReady) {
    throw new OpenRouterClientError(
      'API Key DeepSeek belum diisi. Buka Pengaturan AI untuk menyimpan key ke Cloud DB.',
      { code: 'MISSING_API_KEY', status: 400, retryable: false, provider: 'deepseek' }
    );
  }

  const selectedModel = ensureDeepSeekModelId(settings.deepseekModel);
  const { systemPrompt, userPrompt } = buildLeadPrompt(lead, settings);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  if (signal) signal.addEventListener('abort', onAbort, { once: true });

  try {
    const res = await fetchImpl(DEEPSEEK_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey,
        model: selectedModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
      signal: controller.signal,
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.success) {
      const status = res.status || 500;
      const code =
        data?.code ||
        (status === 401
          ? 'UNAUTHORIZED'
          : status === 402
            ? 'INSUFFICIENT_BALANCE'
            : status === 429
              ? 'RATE_LIMITED'
              : 'UPSTREAM_ERROR');

      const retryableOnFallback =
        status === 402 || status === 429 || status >= 500 || code === 'TIMEOUT';

      throw new OpenRouterClientError(
        data?.error || `DeepSeek gagal merespons (${status}).`,
        { code, status, retryable: retryableOnFallback, provider: 'deepseek' }
      );
    }

    const modelLabel = `deepseek/${data.model || selectedModel}`;
    return parseAiResearchResponse(data.content || '', modelLabel, lead, settings);
  } catch (err) {
    if (err instanceof OpenRouterClientError) throw err;
    if (err?.name === 'AbortError') {
      throw new OpenRouterClientError(
        signal?.aborted
          ? 'Proses analisis AI dibatalkan.'
          : 'Permintaan ke DeepSeek melebihi batas waktu (45 detik).',
        {
          code: signal?.aborted ? 'ABORTED' : 'TIMEOUT',
          retryable: !signal?.aborted,
          provider: 'deepseek',
        }
      );
    }
    throw new OpenRouterClientError(
      `Gagal terhubung ke endpoint DeepSeek: ${err?.message || 'Periksa jaringan Anda.'}`,
      { code: 'NETWORK_ERROR', retryable: true, provider: 'deepseek' }
    );
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

export async function analyzeLeadWithOpenRouter(
  lead,
  rawSettings = {},
  { signal, fetchImpl = globalThis.fetch, timeoutMs = 35000 } = {}
) {
  const settings = { ...DEFAULT_AI_SETTINGS, ...rawSettings };
  const apiKey = String(settings.openrouterApiKey || settings.apiKey || '').trim();
  const useCloudProxy = !apiKey && Boolean(settings.cloudOpenrouterReady);

  if (!apiKey && !useCloudProxy) {
    throw new OpenRouterClientError(
      'API Key OpenRouter belum diisi. Buka Pengaturan AI untuk menyimpan key gratis ke Cloud DB.',
      { code: 'MISSING_API_KEY', status: 400, retryable: false, provider: 'openrouter' }
    );
  }

  const selectedModel = ensureFreeModelId(settings.openrouterModel || settings.model);
  const { systemPrompt, userPrompt } = buildLeadPrompt(lead, settings);
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  if (signal) signal.addEventListener('abort', onAbort, { once: true });

  try {
    if (useCloudProxy) {
      const res = await fetchImpl(OPENROUTER_PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: selectedModel,
          messages,
        }),
        signal: controller.signal,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        const status = res.status || 500;
        const code =
          data?.code ||
          (status === 401
            ? 'UNAUTHORIZED'
            : status === 402
              ? 'PAYMENT_REQUIRED'
              : status === 429
                ? 'RATE_LIMITED'
                : 'UPSTREAM_ERROR');
        const retryable = status === 402 || status === 429 || status >= 500 || code === 'TIMEOUT';
        throw new OpenRouterClientError(
          data?.error || `OpenRouter gagal merespons (${status}).`,
          { code, status, retryable, provider: 'openrouter' }
        );
      }

      return parseAiResearchResponse(data.content || '', data.model || selectedModel, lead, settings);
    }

    const referer =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'http://localhost:3000';

    const res = await fetchImpl(OPENROUTER_CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': referer,
        'X-Title': 'GMaps LeadGen Suite',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: selectedModel,
        messages,
        temperature: 0.35,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      let detail = '';
      try {
        const errJson = await res.json();
        detail = errJson?.error?.message || '';
      } catch {
        detail = await res.text().catch(() => '');
      }

      if (res.status === 401) {
        throw new OpenRouterClientError(
          'API Key OpenRouter tidak valid atau sudah kadaluarsa (401).',
          { code: 'UNAUTHORIZED', status: 401, retryable: false, provider: 'openrouter' }
        );
      }
      if (res.status === 402) {
        throw new OpenRouterClientError(
          'Batas penggunaan akun gratis OpenRouter tercapai (402).',
          { code: 'PAYMENT_REQUIRED', status: 402, retryable: true, provider: 'openrouter' }
        );
      }
      if (res.status === 429) {
        throw new OpenRouterClientError(
          'Rate limit model gratis OpenRouter tercapai (~20 req/menit).',
          { code: 'RATE_LIMITED', status: 429, retryable: true, provider: 'openrouter' }
        );
      }
      throw new OpenRouterClientError(
        `OpenRouter gagal merespons (${res.status})${detail ? `: ${detail.slice(0, 160)}` : '.'}`,
        {
          code: 'UPSTREAM_ERROR',
          status: res.status,
          retryable: res.status >= 500,
          provider: 'openrouter',
        }
      );
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || '';
    const actualModel = data?.model || selectedModel;

    return parseAiResearchResponse(content, actualModel, lead, settings);
  } catch (err) {
    if (err instanceof OpenRouterClientError) throw err;
    if (err?.name === 'AbortError') {
      throw new OpenRouterClientError(
        signal?.aborted
          ? 'Proses analisis AI dibatalkan.'
          : 'Permintaan ke OpenRouter melebihi batas waktu (35 detik).',
        {
          code: signal?.aborted ? 'ABORTED' : 'TIMEOUT',
          retryable: !signal?.aborted,
          provider: 'openrouter',
        }
      );
    }
    throw new OpenRouterClientError(
      `Gagal terhubung ke OpenRouter: ${err?.message || 'Periksa koneksi internet Anda.'}`,
      { code: 'NETWORK_ERROR', retryable: true, provider: 'openrouter' }
    );
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

export function buildGroundedMuseResearch(lead = {}, rawSettings = {}) {
  const settings = { ...DEFAULT_AI_SETTINGS, ...rawSettings };
  const identity = extractBusinessIdentity(
    lead?.name,
    lead?.categoryName || lead?.category,
    lead?.address
  );
  const evaluation = evaluateLeadQualification(lead);
  const ratingVal = parseFloat(String(lead?.rating || '4.7').replace(',', '.')) || 4.7;
  const reviewVal = parseInt(String(lead?.reviewCount || '25').replace(/[^\d]/g, ''), 10) || 25;

  let leadQualification = 'HOT LEAD';
  let leadScore = 88;
  if (evaluation.recommendDelete) {
    leadQualification = 'COLD LEAD';
    leadScore = 24;
  } else if (evaluation.tier === 'PRIME') {
    leadQualification = 'HOT LEAD';
    leadScore = Math.min(96, Math.max(82, Math.round(ratingVal * 15 + Math.min(reviewVal, 150) / 10)));
  } else {
    leadQualification = 'WARM LEAD';
    leadScore = 68;
  }

  const channelSummary = [
    lead?.socialMedia ? `aktif di sosial media (${lead.socialMedia})` : 'belum mencantumkan sosial media',
    lead?.onlineShop ? `dan hadir di marketplace (${lead.onlineShop})` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const digitalPresenceSummary = humanizeGeneratedText(
    `${identity.cleanBrandName} di ${identity.address || 'area lokal'} memiliki reputasi Google Maps ${ratingVal.toFixed(1)} (${reviewVal} ulasan), ${channelSummary}, namun terbukti belum memiliki website berdomain resmi sendiri.`
  );

  const pitchAngle = humanizeGeneratedText(
    `Bantu ${identity.cleanBrandName} memiliki ${identity.valuePropLabel} agar pelanggan dari Google Maps dapat langsung melihat layanan resmi dan memesan via WhatsApp.`
  );

  return {
    leadQualification,
    leadScore,
    hasOfficialWebsite: evaluation.websiteType === 'OWNED_DOMAIN',
    opportunityType: identity.opportunityDefault,
    digitalPresenceSummary,
    pitchAngle,
    pitchDraft: buildDefaultWaPitch(lead, settings),
    qualificationReplyDraft: buildQualificationReplyDraft(lead, settings),
    followUpDraft: humanizeGeneratedText(
      `Halo Kak, izin menyapa kembali dari ${resolveAgencyName(settings.agencyName)}. Apakah gambaran tampilan web singkat untuk ${identity.cleanBrandName} boleh kami coba buatkan?`
    ),
    museClientNotes: String(lead?.aiResearch?.museClientNotes || '').trim(),
    museReferenceUrl: String(lead?.aiResearch?.museReferenceUrl || '').trim(),
    museShareUrl: String(lead?.aiResearch?.museShareUrl || lead?.museShareUrl || '').trim(),
    pipelineStage: String(lead?.aiResearch?.pipelineStage || 'QUEUED').trim(),
    botPaused: Boolean(lead?.aiResearch?.botPaused),
    modelUsed: DEFAULT_MUSE_MODEL,
    analyzedAt: new Date().toISOString(),
  };
}

export async function analyzeLeadWithMuse(
  lead,
  rawSettings = {},
  { signal, fetchImpl = globalThis.fetch, timeoutMs = 25000 } = {}
) {
  const settings = { ...DEFAULT_AI_SETTINGS, ...rawSettings };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  if (signal) signal.addEventListener('abort', onAbort, { once: true });

  try {
    const res = await fetchImpl(MUSE_RESEARCH_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lead,
        settings: {
          agencyName: resolveAgencyName(settings.agencyName),
          agencyWebsite: settings.agencyWebsite || DEFAULT_AGENCY_WEBSITE,
          serviceFocus: settings.serviceFocus,
          pitchTone: settings.pitchTone,
        },
      }),
      signal: controller.signal,
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.success && data?.aiResearch) {
      return {
        ...data.aiResearch,
        modelUsed: data.aiResearch.modelUsed || DEFAULT_MUSE_MODEL,
      };
    }
    return buildGroundedMuseResearch(lead, settings);
  } catch (err) {
    if (err?.name === 'AbortError' && signal?.aborted) {
      throw new OpenRouterClientError('Proses analisis Muse.ai dibatalkan.', {
        code: 'ABORTED',
        retryable: false,
        provider: 'muse',
      });
    }
    return buildGroundedMuseResearch(lead, settings);
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

export function resolveActiveProvider(rawSettings = {}) {
  const settings = { ...DEFAULT_AI_SETTINGS, ...rawSettings };
  const hasMuse = isMuseConfigured(settings);
  const hasDeepSeek = isDeepSeekConfigured(settings);
  const hasOpenRouter = isOpenRouterConfigured(settings);
  const preferred = ['muse', 'deepseek', 'openrouter'].includes(rawSettings.primaryProvider)
    ? rawSettings.primaryProvider
    : settings.primaryProvider;

  if (preferred === 'muse') {
    if (hasMuse) return 'muse';
    if (hasDeepSeek) return 'deepseek';
    if (hasOpenRouter) return 'openrouter';
    return 'muse';
  }

  if (preferred === 'deepseek') {
    if (hasDeepSeek) return 'deepseek';
    if (hasOpenRouter) return 'openrouter';
    if (hasMuse && rawSettings.primaryProvider === undefined) return 'muse';
    return 'deepseek';
  }

  if (hasOpenRouter) return 'openrouter';
  if (hasDeepSeek) return 'deepseek';
  if (hasMuse && rawSettings.primaryProvider === undefined) return 'muse';
  return 'openrouter';
}

export async function analyzeLeadWithAi(lead, rawSettings = {}, options = {}) {
  const settings = { ...DEFAULT_AI_SETTINGS, ...rawSettings };
  const hasMuse = isMuseConfigured(settings);
  const hasDeepSeek = isDeepSeekConfigured(settings);
  const hasOpenRouter = isOpenRouterConfigured(settings);

  const explicitNonMuse =
    rawSettings.primaryProvider === 'deepseek' || rawSettings.primaryProvider === 'openrouter';

  if (explicitNonMuse && !hasDeepSeek && !hasOpenRouter) {
    throw new OpenRouterClientError(
      'Belum ada API Key AI yang tersimpan. Buka Pengaturan AI lalu simpan API Key DeepSeek atau OpenRouter.',
      { code: 'MISSING_API_KEY', status: 400, retryable: false }
    );
  }

  const activePrimary = resolveActiveProvider(rawSettings);
  const secondary =
    activePrimary === 'deepseek'
      ? hasOpenRouter
        ? 'openrouter'
        : 'muse'
      : activePrimary === 'openrouter'
        ? hasDeepSeek
          ? 'deepseek'
          : 'muse'
        : hasDeepSeek
          ? 'deepseek'
          : 'openrouter';

  const secondaryReady =
    secondary === 'deepseek'
      ? hasDeepSeek
      : secondary === 'openrouter'
        ? hasOpenRouter
        : hasMuse;

  const runForProvider = (providerName) => {
    if (providerName === 'muse') return analyzeLeadWithMuse(lead, settings, options);
    if (providerName === 'deepseek') return analyzeLeadWithDeepSeek(lead, settings, options);
    return analyzeLeadWithOpenRouter(lead, settings, options);
  };

  try {
    const result = await runForProvider(activePrimary);
    return {
      ...result,
      providerUsed: activePrimary,
      fallbackFrom: null,
    };
  } catch (primaryErr) {
    if (primaryErr?.code === 'ABORTED') throw primaryErr;

    const canFallback =
      Boolean(settings.autoFallback) &&
      secondaryReady &&
      Boolean(primaryErr?.retryable);

    if (!canFallback) {
      throw primaryErr;
    }

    const fallbackResult = await runForProvider(secondary);
    return {
      ...fallbackResult,
      providerUsed: secondary,
      fallbackFrom: activePrimary,
    };
  }
}

export async function testAiProviderConnection(provider, rawSettings = {}, options = {}) {
  const start = Date.now();
  const sampleLead = {
    name: 'Kopi Senja Nusantara',
    categoryName: 'Kedai Kopi',
    address: 'Jl. Pajajaran No. 18, Bogor',
    rating: '4.8',
    reviewCount: '312',
    website: '',
    socialMedia: 'https://instagram.com/kopisenja',
    onlineShop: '',
    phone: '081234567890',
  };

  const result =
    provider === 'muse'
      ? await analyzeLeadWithMuse(sampleLead, rawSettings, options)
      : provider === 'deepseek'
        ? await analyzeLeadWithDeepSeek(sampleLead, rawSettings, options)
        : await analyzeLeadWithOpenRouter(sampleLead, rawSettings, options);

  return {
    ok: true,
    provider,
    latencyMs: Date.now() - start,
    modelUsed: result.modelUsed,
    qualification: result.leadQualification,
  };
}

let cachedSettingsRaw = null;
let cachedSettingsObj = DEFAULT_AI_SETTINGS;
const settingsListeners = new Set();

function normalizeSettingsObject(parsed = {}) {
  return {
    ...DEFAULT_AI_SETTINGS,
    primaryProvider: ['muse', 'deepseek', 'openrouter'].includes(parsed.primaryProvider)
      ? parsed.primaryProvider
      : DEFAULT_AI_SETTINGS.primaryProvider,
    autoFallback: typeof parsed.autoFallback === 'boolean' ? parsed.autoFallback : true,
    deepseekApiKey: String(parsed.deepseekApiKey || '').trim(),
    deepseekModel: ensureDeepSeekModelId(parsed.deepseekModel),
    openrouterApiKey: String(parsed.openrouterApiKey || parsed.apiKey || '').trim(),
    openrouterModel: ensureFreeModelId(parsed.openrouterModel || parsed.model),
    agencyName: resolveAgencyName(parsed.agencyName),
    agencyWebsite: String(parsed.agencyWebsite || DEFAULT_AGENCY_WEBSITE).trim(),
    serviceFocus: String(parsed.serviceFocus ?? DEFAULT_AI_SETTINGS.serviceFocus),
    pitchTone: ['casual', 'consultative', 'formal'].includes(parsed.pitchTone)
      ? parsed.pitchTone
      : 'casual',
    cloudDeepseekReady: Boolean(parsed.cloudDeepseekReady),
    cloudDeepseekMask: String(parsed.cloudDeepseekMask || ''),
    cloudOpenrouterReady: Boolean(parsed.cloudOpenrouterReady),
    cloudOpenrouterMask: String(parsed.cloudOpenrouterMask || ''),
  };
}

export function mergeCloudAndLocalAiSettings(cloudSettings = null, localSettings = {}) {
  const localNorm = normalizeSettingsObject(localSettings);
  if (!cloudSettings) {
    return localNorm;
  }

  return normalizeSettingsObject({
    ...localNorm,
    primaryProvider: cloudSettings.primaryProvider || localNorm.primaryProvider,
    autoFallback:
      typeof cloudSettings.autoFallback === 'boolean'
        ? cloudSettings.autoFallback
        : localNorm.autoFallback,
    deepseekModel: cloudSettings.deepseekModel || localNorm.deepseekModel,
    openrouterModel: cloudSettings.openrouterModel || localNorm.openrouterModel,
    agencyName: cloudSettings.agencyName || localNorm.agencyName,
    serviceFocus: cloudSettings.serviceFocus || localNorm.serviceFocus,
    pitchTone: cloudSettings.pitchTone || localNorm.pitchTone,
    cloudDeepseekReady: Boolean(cloudSettings.cloudDeepseekReady),
    cloudDeepseekMask: cloudSettings.cloudDeepseekMask || '',
    cloudOpenrouterReady: Boolean(cloudSettings.cloudOpenrouterReady),
    cloudOpenrouterMask: cloudSettings.cloudOpenrouterMask || '',
  });
}

export function subscribeAiSettings(listener) {
  settingsListeners.add(listener);
  if (typeof window === 'undefined') {
    return () => settingsListeners.delete(listener);
  }
  const onStorage = (e) => {
    if (e.key === AI_SETTINGS_STORAGE_KEY) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    settingsListeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function getServerAiSettingsSnapshot() {
  return DEFAULT_AI_SETTINGS;
}

export function loadAiSettings() {
  if (typeof window === 'undefined') return DEFAULT_AI_SETTINGS;
  try {
    let raw = window.localStorage.getItem(AI_SETTINGS_STORAGE_KEY);
    if (!raw) {
      const legacyRaw = window.localStorage.getItem(LEGACY_OPENROUTER_STORAGE_KEY);
      if (legacyRaw) {
        const migrated = normalizeSettingsObject(JSON.parse(legacyRaw));
        raw = JSON.stringify(migrated);
        window.localStorage.setItem(AI_SETTINGS_STORAGE_KEY, raw);
      }
    }

    if (raw === cachedSettingsRaw && cachedSettingsObj) {
      return cachedSettingsObj;
    }
    cachedSettingsRaw = raw;
    if (!raw) {
      cachedSettingsObj = DEFAULT_AI_SETTINGS;
      return cachedSettingsObj;
    }
    cachedSettingsObj = normalizeSettingsObject(JSON.parse(raw));
    return cachedSettingsObj;
  } catch {
    return DEFAULT_AI_SETTINGS;
  }
}

export function saveAiSettings(nextSettings) {
  const merged = normalizeSettingsObject(nextSettings);
  if (typeof window !== 'undefined') {
    const serialized = JSON.stringify(merged);
    window.localStorage.setItem(AI_SETTINGS_STORAGE_KEY, serialized);
    cachedSettingsRaw = serialized;
    cachedSettingsObj = merged;
    settingsListeners.forEach((fn) => fn());
  }
  return merged;
}
