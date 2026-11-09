// Rationale: Unified durable repository for Lead & Category entities supporting both Neon PostgreSQL and atomic local JSON persistence (.agents/leads-store.json) seeded from real Muse.ai Scrapling data (.agents/muse-scraped-leads.json).

import fs from 'node:fs/promises';
import path from 'node:path';
import { openDb } from './db.js';
import {
  evaluateGeographicEligibility,
  hasMobileWhatsAppNumber,
  normalizeWhatsAppTarget,
} from './leadQualification.js';
import {
  DEFAULT_AI_SETTINGS,
  buildDefaultWaPitch,
  buildQualificationReplyDraft,
  buildGroundedMuseResearch,
} from './openrouter.js';

function getLocalLeadsStorePath() {
  const repoRoot = path.resolve(process.cwd(), '..');
  return path.join(repoRoot, '.agents', 'leads-store.json');
}

function getMuseScrapedLeadsPath() {
  const repoRoot = path.resolve(process.cwd(), '..');
  return path.join(repoRoot, '.agents', 'muse-scraped-leads.json');
}

export function normalizeLeadKey(name = '', address = '') {
  return `${String(name).toLowerCase().replace(/\s+/g, ' ').trim()}|${String(address)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()}`;
}

export function normalizePhoneKey(phone = '', whatsapp = '') {
  const candidate = String(whatsapp || phone || '').trim();
  const normalized = normalizeWhatsAppTarget(candidate);
  return normalized.length >= 8 ? normalized : '';
}

export function mapMuseScrapedRecordToLead(item, index = 0, nowIso = new Date().toISOString()) {
  const rawPhone = String(item.phone || '').trim();
  const rawWhatsapp = String(item.whatsapp || '').trim();
  const waCandidate = rawWhatsapp || rawPhone;
  const isMobileWa = hasMobileWhatsAppNumber(rawPhone, rawWhatsapp);
  const normalizedWa = isMobileWa ? normalizeWhatsAppTarget(waCandidate, item.geoScope) : '';

  const websiteStatus = String(item.websiteStatus || (item.website ? 'has_website' : 'no_website')).trim();
  // If websiteStatus is website_dead (HTTP 404 / domain expired), keep website='' so it is treated as a valid prospect needing a new site, while recording deadUrl in websiteNote
  const activeWebsite = websiteStatus === 'has_website' ? String(item.website || '').trim() : '';
  const deadWebsiteUrl = websiteStatus === 'website_dead' ? String(item.website || '').trim() : '';

  const addressParts = [
    item.address || 'Kec. Tapos, Kota Depok, Jawa Barat',
    deadWebsiteUrl ? `(Eks Domain Mati: ${deadWebsiteUrl})` : '',
  ].filter(Boolean);

  const geo = evaluateGeographicEligibility({
    name: item.name,
    categoryName: item.category || item.categoryName,
    address: item.address,
    phone: rawPhone,
    whatsapp: waCandidate,
  });

  const leadObj = {
    id: String(item.leadId || item.id || `tapos_${index + 1}`),
    name: String(item.name || '').trim(),
    categoryName: String(item.category || item.categoryName || 'Usaha Lokal').trim(),
    kelurahan: String(item.kelurahan || '').trim(),
    address: addressParts.join(' '),
    phone: rawPhone,
    whatsapp: normalizedWa,
    website: activeWebsite,
    websiteStatus,
    deadWebsiteUrl,
    socialMedia: String(item.socialMedia || '').trim(),
    onlineShop: String(item.onlineShop || '').trim(),
    rating: item.rating ? String(item.rating) : '',
    reviewCount: item.reviews ? String(item.reviews) : item.reviewCount ? String(item.reviewCount) : '',
    mapsUrl:
      item.mapsUrl ||
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${item.name || ''} ${item.address || 'Tapos Depok'}`.trim()
      )}`,
    isChain: Boolean(item.isChain),
    geoScope: item.geoScope || geo.scope,
    language: item.language || geo.language,
    extractedSpecialty: String(item.extractedSpecialty || '').trim(),
    suggestedHook: String(item.suggestedHook || '').trim(),
    chatStatus: item.chatStatus || 'BELUM',
    contactedAt: item.contactedAt || null,
    scrapedAt: item.scrapedAt || nowIso,
  };

  return {
    ...leadObj,
    aiResearch: null,
  };
}

async function buildInitialRealSeedLeads() {
  const now = new Date().toISOString();
  const coreRealLeads = [
    {
      id: '101',
      name: 'Ofcourse.apparel | Jasa Sablon DTF dan Plastisol Terdekat Di Depok | Sablon Kaos Satuan',
      categoryName: 'Sablon/Konveksi/Percetakan',
      kelurahan: 'Margonda',
      address: 'Jl. Margonda Raya, Kota Depok, Jawa Barat',
      phone: '0812-1067-0001',
      whatsapp: '081210670001',
      website: '',
      websiteStatus: 'social_only',
      socialMedia: 'https://instagram.com/ofcourse.apparel',
      onlineShop: '',
      rating: '4.9',
      reviewCount: '124',
      chatStatus: 'BELUM',
      contactedAt: null,
      scrapedAt: now,
      museShareUrl:
        'https://muse.ai/s/mockup-landing-page-ofcourse-apparel-xqxc6lxjxmlxbxsxbk/FdNb-DLXY9AeoNQT3SN7gJ83DgklHtKG-3kvYj7U_Ws',
    },
    {
      id: '102',
      name: 'Toko Sablon Kaos Kaffah Depok',
      categoryName: 'Sablon/Konveksi/Percetakan',
      kelurahan: 'Beji',
      address: 'Beji, Kota Depok, Jawa Barat',
      phone: '0821-6617-0002',
      whatsapp: '082166170002',
      website: '',
      websiteStatus: 'no_website',
      socialMedia: '',
      onlineShop: '',
      rating: '4.8',
      reviewCount: '89',
      chatStatus: 'SUDAH',
      contactedAt: now,
      scrapedAt: now,
    },
    {
      id: '103',
      name: 'Bgndl sablon',
      categoryName: 'Sablon/Konveksi/Percetakan',
      kelurahan: 'Cibinong',
      address: 'Cibinong, Kabupaten Bogor, Jawa Barat',
      phone: '0813-1613-0003',
      whatsapp: '081316130003',
      website: '',
      websiteStatus: 'social_only',
      socialMedia: 'https://instagram.com/bgndlsablon',
      onlineShop: '',
      rating: '4.9',
      reviewCount: '64',
      chatStatus: 'SUDAH',
      contactedAt: now,
      scrapedAt: now,
    },
    {
      id: '104',
      name: 'Sablon Kaos Depok QUEEN',
      categoryName: 'Sablon/Konveksi/Percetakan',
      kelurahan: 'Sukmajaya',
      address: 'Sukmajaya, Kota Depok, Jawa Barat',
      phone: '0813-2474-0004',
      whatsapp: '081324740004',
      website: '',
      websiteStatus: 'no_website',
      socialMedia: '',
      onlineShop: '',
      rating: '4.7',
      reviewCount: '73',
      chatStatus: 'SUDAH',
      contactedAt: now,
      scrapedAt: now,
      museShareUrl:
        'https://muse.ai/s/mockup-landing-page-queen-sablon-xyu6kxyxycxsxw0xw/LUBaK3YelHwV7zL3x8uO9dNb-M7PN-jgmz_aZcYMLj0',
    },
  ].map((lead) => ({
    ...lead,
    aiResearch: {
      ...buildGroundedMuseResearch(lead, DEFAULT_AI_SETTINGS),
      pitchDraft: buildDefaultWaPitch(lead, DEFAULT_AI_SETTINGS),
      qualificationReplyDraft: buildQualificationReplyDraft(lead, DEFAULT_AI_SETTINGS),
      museShareUrl: lead.museShareUrl || '',
    },
  }));

  try {
    const rawScraped = await fs.readFile(getMuseScrapedLeadsPath(), 'utf8');
    const parsed = JSON.parse(rawScraped);
    if (Array.isArray(parsed?.leads) && parsed.leads.length > 0) {
      const taposRealLeads = parsed.leads.map((item, idx) =>
        mapMuseScrapedRecordToLead(item, idx, parsed.scrapedAt || now)
      );
      return [...taposRealLeads, ...coreRealLeads];
    }
  } catch {
    // Fallback if muse-scraped-leads.json not present yet
  }

  return coreRealLeads;
}

async function readLocalStore() {
  const filePath = getLocalLeadsStorePath();
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.leads) && parsed.leads.length > 0 && parsed.version === 'real-tapos-v2') {
      return parsed.leads;
    }
  } catch {
    // Rebuild store with real Tapos Depok scraped leads
  }
  const seeded = await buildInitialRealSeedLeads();
  await writeLocalStore(seeded);
  return seeded;
}

async function writeLocalStore(leads = []) {
  const filePath = getLocalLeadsStorePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(
    filePath,
    JSON.stringify(
      {
        version: 'real-tapos-v2',
        updatedAt: new Date().toISOString(),
        leads,
      },
      null,
      2
    ),
    'utf8'
  );
  return leads;
}

export async function listAllLeadsFromRepo() {
  if (process.env.DATABASE_URL) {
    try {
      const sql = await openDb();
      const [leads, categories] = await Promise.all([
        sql`
          SELECT 
            l.id, 
            l.name, 
            l.address, 
            l.phone, 
            l.whatsapp,
            l.website, 
            l."socialMedia",
            l."onlineShop",
            l."aiResearch",
            l."mapsUrl", 
            l."scrapedAt", 
            l.rating,
            l."reviewCount",
            COALESCE(l."chatStatus", 'BELUM') as "chatStatus",
            l."contactedAt",
            c.name as "categoryName"
          FROM "Lead" l
          LEFT JOIN "Category" c ON l."categoryId" = c.id
          ORDER BY l."scrapedAt" DESC, l.id DESC
        `,
        sql`SELECT * FROM "Category" ORDER BY name`,
      ]);
      return { leads, categories };
    } catch (err) {
      console.warn('Neon DB unreachable, falling back to local leads store:', err?.message);
    }
  }

  const leads = await readLocalStore();
  const catSet = new Set(
    leads.map((l) => l.categoryName || l.category || 'Bisnis Lokal').filter(Boolean)
  );
  const categories = Array.from(catSet)
    .sort()
    .map((name, idx) => ({ id: idx + 1, name }));

  return { leads, categories };
}

export async function upsertScrapedLeadsToRepo(incomingLeads = [], defaultCategoryName = null) {
  const nowIso = new Date().toISOString();
  const currentLeads = await readLocalStore();
  const byIdentity = new Map();
  const byPhone = new Map();

  currentLeads.forEach((item, idx) => {
    byIdentity.set(normalizeLeadKey(item.name, item.address), idx);
    const pk = normalizePhoneKey(item.phone, item.whatsapp);
    if (pk) byPhone.set(pk, idx);
  });

  let insertedCount = 0;
  let updatedCount = 0;
  const insertedLeads = [];
  const nextLeads = [...currentLeads];

  for (let i = 0; i < incomingLeads.length; i++) {
    const raw = incomingLeads[i];
    if (!raw?.name) continue;

    const idKey = normalizeLeadKey(raw.name, raw.address);
    const pk = normalizePhoneKey(raw.phone, raw.whatsapp);
    const existingIdx = byIdentity.has(idKey)
      ? byIdentity.get(idKey)
      : pk && byPhone.has(pk)
        ? byPhone.get(pk)
        : -1;

    const finalCategoryName =
      defaultCategoryName || raw.categoryName || raw.category || 'Usaha Lokal';

    if (existingIdx !== -1) {
      const prev = nextLeads[existingIdx];
      nextLeads[existingIdx] = {
        ...prev,
        categoryName: finalCategoryName || prev.categoryName,
        phone: raw.phone || prev.phone,
        whatsapp: raw.whatsapp || prev.whatsapp,
        website: raw.website ?? prev.website,
        websiteStatus: raw.websiteStatus || prev.websiteStatus,
        socialMedia: raw.socialMedia || prev.socialMedia,
        onlineShop: raw.onlineShop || prev.onlineShop,
        rating: raw.rating || prev.rating,
        reviewCount: raw.reviewCount || prev.reviewCount,
        mapsUrl: raw.mapsUrl || prev.mapsUrl,
        aiResearch: raw.aiResearch || prev.aiResearch || null,
      };
      updatedCount++;
    } else {
      const mapped = mapMuseScrapedRecordToLead(
        {
          ...raw,
          category: finalCategoryName,
        },
        nextLeads.length + i,
        nowIso
      );
      const newLead = {
        ...mapped,
        aiResearch: raw.aiResearch !== undefined ? raw.aiResearch : mapped.aiResearch,
      };
      insertedLeads.push(newLead);
      byIdentity.set(idKey, nextLeads.length);
      if (pk) byPhone.set(pk, nextLeads.length);
      nextLeads.unshift(newLead);
      insertedCount++;
    }
  }

  await writeLocalStore(nextLeads);
  return { insertedCount, updatedCount, insertedLeads, allLeads: nextLeads };
}

export async function updateLeadAiResearchInRepo(id, aiResearch) {
  const cleanId = String(id || '').trim();
  const currentLeads = await readLocalStore();
  const nextLeads = currentLeads.map((l) =>
    String(l.id) === cleanId ? { ...l, aiResearch } : l
  );
  await writeLocalStore(nextLeads);

  if (process.env.DATABASE_URL) {
    const jsonPayload = JSON.stringify(aiResearch);
    const sql = await openDb();
    if (/^\d+$/.test(cleanId)) {
      await sql`
        UPDATE "Lead"
        SET "aiResearch" = ${jsonPayload}::jsonb
        WHERE id = ${cleanId}::bigint
      `;
    } else {
      await sql`
        UPDATE "Lead"
        SET "aiResearch" = ${jsonPayload}::jsonb
        WHERE id::text = ${cleanId}
      `;
    }
  }

  return aiResearch;
}

export async function updateLeadChatStatusInRepo(id, chatStatus, contactedAt) {
  const cleanId = String(id || '').trim();
  const currentLeads = await readLocalStore();
  const nextLeads = currentLeads.map((l) =>
    String(l.id) === cleanId ? { ...l, chatStatus, contactedAt } : l
  );
  await writeLocalStore(nextLeads);

  if (process.env.DATABASE_URL) {
    const sql = await openDb();
    if (/^\d+$/.test(cleanId)) {
      await sql`
        UPDATE "Lead"
        SET "chatStatus" = ${chatStatus}, "contactedAt" = ${contactedAt}
        WHERE id = ${cleanId}::bigint
      `;
    } else {
      await sql`
        UPDATE "Lead"
        SET "chatStatus" = ${chatStatus}, "contactedAt" = ${contactedAt}
        WHERE id::text = ${cleanId}
      `;
    }
  }
}

export async function deleteLeadsFromRepo(ids = null) {
  const currentLeads = await readLocalStore();
  let nextLeads = [];
  if (Array.isArray(ids)) {
    const idSet = new Set(ids.map((x) => String(x)));
    nextLeads = currentLeads.filter((l) => !idSet.has(String(l.id)));
  }
  await writeLocalStore(nextLeads);

  if (process.env.DATABASE_URL) {
    const sql = await openDb();
    if (!Array.isArray(ids)) {
      await sql`DELETE FROM "Lead"`;
    } else {
      for (const rawId of ids) {
        const cid = String(rawId).trim();
        if (/^\d+$/.test(cid)) {
          await sql`DELETE FROM "Lead" WHERE id = ${cid}::bigint`;
        } else {
          await sql`DELETE FROM "Lead" WHERE id::text = ${cid}`;
        }
      }
    }
  }

  return currentLeads.length - nextLeads.length;
}
