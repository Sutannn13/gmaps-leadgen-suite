// Rationale: Deterministic zero-token lead qualification & cleanup recommendation engine tailored for agencies targeting businesses without an official owned website.

const SOCIAL_DOMAINS = [
  'instagram.com',
  'instagr.am',
  'ig.me',
  'facebook.com',
  'fb.com',
  'fb.me',
  'tiktok.com',
  'twitter.com',
  'x.com',
  'youtube.com',
  'youtu.be',
  'linktr.ee',
  's.id',
  'bit.ly',
  'campsite.bio',
  'beacons.ai',
  'heylink.me',
  'bio.link',
  'taplink.cc',
  'lynk.id',
  'msha.ke',
  'desty.page',
];

const MARKETPLACE_DOMAINS = [
  'shopee.',
  'shope.ee',
  'shp.ee',
  'tokopedia.',
  'tkp.me',
  'lazada.',
  'lzd.co',
  'bukalapak.',
  'bl.id',
  'blibli.',
  'blib.li',
  'grab.com',
  'gofood.',
  'shopeefood',
  'olx.co.id',
  'carousell.',
];

const FREE_BUILDER_DOMAINS = [
  'blogspot.',
  'wordpress.com',
  'sites.google.com',
  'business.site',
  'my.canva.site',
  'canva.site',
  'carrd.co',
  'wixsite.com',
  'weebly.com',
  'zyrosite.com',
  '000webhostapp.com',
  'github.io',
  'netlify.app',
  'vercel.app',
  'berdu.pw',
];

const AGGREGATOR_OR_UTILITY_DOMAINS = [
  'google.',
  'gstatic.',
  'waze.com',
  'wa.me',
  'whatsapp.com',
  'traveloka.',
  'tiket.com',
  'agoda.',
  'booking.com',
  'pergikuliner.',
  'zomato.',
  'chope.',
  'halodoc.',
  'alodokter.',
  'tripadvisor.',
  'yelp.',
];

// High-confidence national chains, franchises, banks, government offices, and public institutions
const FRANCHISE_OR_PUBLIC_PATTERNS = [
  /\b(?:indomaret|alfamart|alfamidi|lawson|familymart|circle\s*k|super\s*indo|hypermart|transmart)\b/i,
  /\b(?:mcdonald'?s|kfc|burger\s*king|pizza\s*hut|domino'?s\s*pizza|starbucks|chatime|mixue|kopi\s*kenangan|fore\s*coffee|janji\s*jiwa|point\s*coffee|hokben|solaria|richeese\s*factory|j\.co|breadtalk|mie\s*gacoan)\b/i,
  /\b(?:guardian|watsons|kimia\s*farma|apotek\s*k-?24|mr\.?\s*d\.?i\.?y|ace\s*hardware|azko|informa|erafone|ibox|digimap)\b/i,
  /\b(?:bank\s*(?:bri|bca|mandiri|bni|bsi|btn|cimb|danamon|permata|jateng|jabar|bjb|jatim|dki)|atm\s+(?:bca|bri|mandiri|bni|bsi|bersama|link))\b/i,
  /\b(?:spbu\s*pertamina|pertashop|puskesmas|rsud|kantor\s*(?:desa|kelurahan|kecamatan|pos|pajak|urusan\s*agama|kua|polisi)|polsek|polres|koramil)\b/i,
  /\b(?:sd\s*negeri|sdn\s*\d|smp\s*negeri|smpn\s*\d|sma\s*negeri|sman\s*\d|smk\s*negeri|smkn\s*\d)\b/i,
  /\b(?:jne\s|j&t\s*express|sicepat|anteraja|ninja\s*xpress|lion\s*parcel|pos\s*indonesia)\b/i,
];

const PUBLIC_CATEGORY_PATTERNS = [
  /\b(?:kantor\s*pemerintah|sekolah\s*negeri|kantor\s*polisi|tempat\s*ibadah|masjid|gereja|pura|vihara|stasiun\s*pengisian\s*bahan\s*bakar|atm|bank\s*sektor\s*publik)\b/i,
];

const CLOSED_STATUS_PATTERN =
  /\b(?:tutup\s*permanen|permanently\s*closed|tutup\s*sementara|temporarily\s*closed|sudah\s*tutup\s*permanen)\b/i;

export const DELETE_REASON_META = {
  HAS_OWNED_WEBSITE: {
    code: 'HAS_OWNED_WEBSITE',
    shortLabel: 'Sudah Ada Web',
    title: 'Sudah Memiliki Website Resmi Mandiri',
    description: 'Bisnis sudah menggunakan domain mandiri (.com / .id / .co.id), di luar target pembuatan web baru.',
  },
  CLOSED_BUSINESS: {
    code: 'CLOSED_BUSINESS',
    shortLabel: 'Tutup',
    title: 'Bisnis Tutup Permanen / Sementara',
    description: 'Terdeteksi berstatus tutup pada data Google Maps.',
  },
  FRANCHISE_OR_INSTITUTION: {
    code: 'FRANCHISE_OR_INSTITUTION',
    shortLabel: 'Franchise / Instansi',
    title: 'Jaringan Franchise Nasional, Bank, atau Instansi Publik',
    description: 'Keputusan pembuatan website berada di kantor pusat korporat atau birokrasi pemerintah.',
  },
  NO_CONTACT_CHANNEL: {
    code: 'NO_CONTACT_CHANNEL',
    shortLabel: 'Tanpa Kontak',
    title: 'Tidak Ada Nomor Kontak maupun Sosial Media',
    description: 'Tidak memiliki nomor telepon/WA, akun sosial media, maupun toko online untuk dihubungi.',
  },
  AI_DISQUALIFIED_COLD: {
    code: 'AI_DISQUALIFIED_COLD',
    shortLabel: 'Skor AI Rendah',
    title: 'Dinilai Tidak Layak oleh Analisis AI (Cold Lead)',
    description: 'Hasil analisis AI menunjukkan prospek berstatus COLD LEAD dengan skor kelayakan di bawah 40.',
  },
};

export function classifyWebsiteUrl(rawUrl) {
  const clean = String(rawUrl || '').trim().toLowerCase();
  if (!clean || clean.length < 4 || !clean.includes('.')) {
    return 'NONE';
  }
  if (SOCIAL_DOMAINS.some((d) => clean.includes(d))) {
    return 'SOCIAL';
  }
  if (MARKETPLACE_DOMAINS.some((d) => clean.includes(d))) {
    return 'MARKETPLACE';
  }
  if (FREE_BUILDER_DOMAINS.some((d) => clean.includes(d))) {
    return 'FREE_BUILDER';
  }
  if (AGGREGATOR_OR_UTILITY_DOMAINS.some((d) => clean.includes(d))) {
    return 'AGGREGATOR';
  }
  return 'OWNED_DOMAIN';
}

export function hasMobileWhatsAppNumber(phone, whatsapp) {
  const raw = String(whatsapp || phone || '').trim();
  const candidate = raw.replace(/[^\d]/g, '');
  if (!candidate) return false;

  // International numbers (e.g. +61, +65, +1, +44)
  if (raw.startsWith('+') && !raw.startsWith('+62')) {
    return candidate.length >= 8;
  }

  return (
    candidate.startsWith('08') ||
    candidate.startsWith('628') ||
    (candidate.startsWith('8') && candidate.length >= 9)
  );
}

// Regex for Jabodetabek (Jakarta, Bogor, Depok, Tangerang, Bekasi & major sub-districts)
const JABODETABEK_PATTERN =
  /\b(?:jakarta|dki|depok|bogor|tangerang|tangsel|bekasi|cibinong|cileungsi|bojong\s*gede|gunung\s*putri|parung|sawangan|tapos|cimanggis|beji|sukmajaya|cinere|ciputat|pamulang|serpong|bsd|bintaro|cikarang|tambun)\b/i;

const OFFLINE_STORE_CATEGORY_PATTERN =
  /\b(?:bengkel|salon|barber|barbershop|toko\s*bangunan|material|klinik|dokter|apotek|cuci\s*mobil|cuci\s*motor|steam|laundry|cafe|kafe|resto|restoran|warung|rumah\s*makan|kedai|mebel|furniture|interior|tambal\s*ban|las\s*karbit|las\s*listrik|service\s*hp|service\s*elektronik)\b/i;

const OVERSEAS_PATTERN =
  /\b(?:singapore|malaysia|australia|united\s*states|usa|united\s*kingdom|uk|japan|korea|germany|canada|netherlands|thailand|vietnam|philippines)\b/i;

export function isJabodetabekAddress(address = '') {
  return JABODETABEK_PATTERN.test(String(address || ''));
}

export function evaluateGeographicEligibility(lead = {}) {
  const address = String(lead.address || '').trim();
  const phone = String(lead.whatsapp || lead.phone || '').trim();
  const category = String(lead.categoryName || lead.category || '').trim();

  // 1. Detect international prospect
  const isOverseasAddress = OVERSEAS_PATTERN.test(address);
  const isOverseasPhone = phone.startsWith('+') && !phone.startsWith('+62');
  if (isOverseasAddress || isOverseasPhone) {
    return {
      eligible: true,
      scope: 'INTERNATIONAL',
      language: 'en',
      reason: 'Prospek internasional (komunikasi menggunakan standar English only).',
    };
  }

  // 2. Offline physical stores require Jabodetabek localization for high-trust closing
  const isOffline = OFFLINE_STORE_CATEGORY_PATTERN.test(category) || OFFLINE_STORE_CATEGORY_PATTERN.test(lead.name || '');
  const inJabodetabek = isJabodetabekAddress(address);

  if (isOffline && !inJabodetabek && address.length > 5) {
    return {
      eligible: false,
      scope: 'OUTSIDE_OFFLINE_SCOPE',
      language: 'id',
      reason: 'Toko fisik di luar jangkauan Jabodetabek (membutuhkan asistensi tatap muka/trust lokal).',
    };
  }

  if (inJabodetabek) {
    return {
      eligible: true,
      scope: 'JABODETABEK',
      language: 'id',
      reason: 'Wilayah operasional prioritas Jabodetabek.',
    };
  }

  // Deliverable businesses / national scale
  return {
    eligible: true,
    scope: 'NATIONAL',
    language: 'id',
    reason: 'Layanan jasa/produk dengan jangkauan pengiriman nasional.',
  };
}

export async function verifyWebsiteTarget(rawUrl = '', options = {}) {
  const clean = String(rawUrl || '').trim();
  if (!clean || clean.length < 4 || !clean.includes('.')) {
    return {
      status: 'no_website',
      hasWebsite: false,
      isDead: false,
      url: '',
      platform: null,
    };
  }

  const classified = classifyWebsiteUrl(clean);
  if (classified === 'SOCIAL') {
    let platform = 'social';
    if (clean.includes('instagram.com') || clean.includes('instagr.am')) platform = 'instagram';
    else if (clean.includes('tiktok.com')) platform = 'tiktok';
    else if (clean.includes('linktr.ee') || clean.includes('bio.link')) platform = 'linktree';
    return {
      status: 'social_only',
      hasWebsite: false,
      isDead: false,
      url: clean,
      platform,
    };
  }

  if (classified === 'MARKETPLACE') {
    return {
      status: 'social_only',
      hasWebsite: false,
      isDead: false,
      url: clean,
      platform: 'marketplace',
    };
  }

  if (classified === 'FREE_BUILDER') {
    return {
      status: 'free_builder',
      hasWebsite: false,
      isDead: false,
      url: clean,
      platform: 'free_builder',
    };
  }

  // Check owned domain validity via HTTP HEAD/GET
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    return {
      status: 'has_website',
      hasWebsite: true,
      isDead: false,
      url: clean,
      platform: 'owned_domain',
    };
  }

  try {
    const fullUrl = clean.startsWith('http://') || clean.startsWith('https://') ? clean : `https://${clean}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 3500);

    const res = await fetchImpl(fullUrl, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'KodeKiri-Verifier/1.0 (+https://kodekiri.tech)',
      },
      signal: controller.signal,
    }).catch(async () => {
      // Fallback to GET if HEAD method is blocked
      return await fetchImpl(fullUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'KodeKiri-Verifier/1.0 (+https://kodekiri.tech)',
        },
        signal: controller.signal,
      });
    });

    clearTimeout(timeout);

    if (res && res.status >= 200 && res.status < 400) {
      return {
        status: 'has_website',
        hasWebsite: true,
        isDead: false,
        url: clean,
        statusCode: res.status,
        platform: 'owned_domain',
      };
    }

    return {
      status: 'website_dead',
      hasWebsite: false,
      isDead: true,
      url: clean,
      statusCode: res?.status || null,
      platform: 'owned_domain',
    };
  } catch {
    return {
      status: 'website_dead',
      hasWebsite: false,
      isDead: true,
      url: clean,
      statusCode: null,
      platform: 'owned_domain',
    };
  }
}

export function evaluateLeadQualification(lead = {}) {
  const name = String(lead.name || '').trim();
  const category = String(lead.categoryName || lead.category || '').trim();
  const address = String(lead.address || '').trim();
  const website = String(lead.website || '').trim();
  const phone = String(lead.phone || '').trim();
  const whatsapp = String(lead.whatsapp || '').trim();
  const socialMedia = String(lead.socialMedia || '').trim();
  const onlineShop = String(lead.onlineShop || '').trim();

  const websiteType = classifyWebsiteUrl(website);
  const hasOwnedWebsite =
    websiteType === 'OWNED_DOMAIN' || Boolean(lead.aiResearch?.hasOfficialWebsite === true);
  const isFreeBuilder = websiteType === 'FREE_BUILDER';

  const isClosed =
    Boolean(lead.isClosed) ||
    CLOSED_STATUS_PATTERN.test(name) ||
    CLOSED_STATUS_PATTERN.test(address);

  const isFranchiseOrPublic =
    FRANCHISE_OR_PUBLIC_PATTERNS.some((re) => re.test(name)) ||
    PUBLIC_CATEGORY_PATTERNS.some((re) => re.test(category));

  const hasAnyContact = Boolean(phone || whatsapp || socialMedia || onlineShop);
  const hasMobileWa = hasMobileWhatsAppNumber(phone, whatsapp);

  const aiQual = String(lead.aiResearch?.leadQualification || '').toUpperCase();
  const aiScore = Number(lead.aiResearch?.leadScore);
  const isAiColdDrop =
    aiQual.includes('COLD') && (Number.isFinite(aiScore) ? aiScore < 40 : true);

  // Check hard disqualification rules in priority order
  let reasonCode = null;
  if (isClosed) {
    reasonCode = 'CLOSED_BUSINESS';
  } else if (hasOwnedWebsite) {
    reasonCode = 'HAS_OWNED_WEBSITE';
  } else if (isFranchiseOrPublic) {
    reasonCode = 'FRANCHISE_OR_INSTITUTION';
  } else if (!hasAnyContact) {
    reasonCode = 'NO_CONTACT_CHANNEL';
  } else if (isAiColdDrop) {
    reasonCode = 'AI_DISQUALIFIED_COLD';
  }

  if (reasonCode) {
    const meta = DELETE_REASON_META[reasonCode];
    return {
      status: 'RECOMMEND_DELETE',
      recommendDelete: true,
      reasonCode,
      shortLabel: meta.shortLabel,
      reasonTitle: meta.title,
      reasonDescription: meta.description,
      tier: 'DROP',
      websiteType,
      hasMobileWa,
    };
  }

  // Evaluate priority tier among valid prospects without owned websites
  const ratingVal = parseFloat(String(lead.rating || '').replace(',', '.'));
  const reviewVal = parseInt(String(lead.reviewCount || '0').replace(/[^\d]/g, ''), 10) || 0;

  const hasActiveFootprint =
    Boolean(socialMedia || onlineShop || isFreeBuilder) ||
    (reviewVal >= 10 && (!Number.isNaN(ratingVal) ? ratingVal >= 4.0 : true));

  const isPrime = hasMobileWa && hasActiveFootprint;

  return {
    status: 'WORTH_PROSPECTING',
    recommendDelete: false,
    reasonCode: null,
    shortLabel: isPrime ? 'Potensial' : 'Layak',
    reasonTitle: isPrime
      ? 'Target Utama: Belum punya web resmi, kontak WA aktif, dan bisnis hidup'
      : 'Layak dianalisis lebih lanjut dengan AI',
    reasonDescription: '',
    tier: isPrime ? 'PRIME' : 'STANDARD',
    websiteType,
    hasMobileWa,
  };
}

export function groupDeleteRecommendations(leads = []) {
  const groups = {};
  let totalFlagged = 0;

  for (const lead of leads) {
    const evaluation = evaluateLeadQualification(lead);
    if (!evaluation.recommendDelete) continue;

    totalFlagged++;
    const code = evaluation.reasonCode;
    if (!groups[code]) {
      const meta = DELETE_REASON_META[code];
      groups[code] = {
        code,
        shortLabel: meta.shortLabel,
        title: meta.title,
        description: meta.description,
        leads: [],
      };
    }
    groups[code].leads.push(lead);
  }

  return {
    totalFlagged,
    groups: Object.values(groups).sort((a, b) => b.leads.length - a.leads.length),
  };
}

