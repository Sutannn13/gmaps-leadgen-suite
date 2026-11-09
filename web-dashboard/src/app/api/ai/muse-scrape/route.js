import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  listAllLeadsFromRepo,
  upsertScrapedLeadsToRepo,
  normalizeLeadKey,
  normalizePhoneKey,
  mapMuseScrapedRecordToLead,
} from '@/lib/leadsRepository';
import {
  evaluateGeographicEligibility,
  verifyWebsiteTarget,
} from '@/lib/leadQualification';

function getScrapePaths() {
  const repoRoot = path.resolve(process.cwd(), '..');
  const agentsDir = path.join(repoRoot, '.agents');
  return {
    agentsDir,
    queuePath: path.join(agentsDir, 'muse-scrape-queue.json'),
    scrapedLeadsPath: path.join(agentsDir, 'muse-scraped-leads.json'),
  };
}

async function tryLiveOsmNominatimScrape(rawQuery) {
  const segments = String(rawQuery || '')
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const queriesToRun = segments.length > 0 ? segments.slice(0, 3) : [rawQuery];

  const allFound = [];
  for (const q of queriesToRun) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
        q
      )}&format=jsonv2&addressdetails=1&extratags=1&limit=10&countrycodes=id`;

      const res = await fetch(url, {
        headers: {
          'User-Agent': 'KodeKiri-GMaps-LeadGen-Suite/1.0 (https://kodekiri.tech)',
          Accept: 'application/json',
        },
        signal: controller.signal,
      });

      if (!res.ok) continue;
      const items = await res.json();
      if (!Array.isArray(items)) continue;

      for (const item of items) {
        const extratags = item.extratags || {};
        const existingWeb = extratags.website || extratags['contact:website'] || '';
        const isSocialOnly = /instagram\.com|linktr\.ee|shopee\.|tokopedia\.|facebook\.com/i.test(existingWeb);

        const rawName = String(item.name || item.display_name?.split(',')[0] || '').trim();
        if (!rawName || rawName.length < 3) continue;

        const phoneRaw =
          extratags.phone ||
          extratags['contact:phone'] ||
          extratags['contact:whatsapp'] ||
          '';

        allFound.push({
          name: rawName,
          category: String(item.type || item.category || q).replace(/_/g, ' '),
          address:
            String(item.display_name || '')
              .split(',')
              .slice(1, 5)
              .join(',')
              .trim() || q,
          phone: phoneRaw,
          website: isSocialOnly ? '' : existingWeb,
          websiteStatus: existingWeb
            ? isSocialOnly
              ? 'social_only'
              : 'has_website'
            : extratags['contact:instagram']
              ? 'social_only'
              : 'no_website',
          socialMedia: isSocialOnly ? existingWeb : extratags['contact:instagram'] || '',
          onlineShop: '',
          rating: '',
          reviews: '',
          mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
            `${rawName} ${item.display_name || ''}`
          )}`,
        });
      }
    } catch {
      // Continue to next segment
    } finally {
      clearTimeout(timer);
    }
  }
  return allFound;
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const targetQuery = String(body?.targetQuery || 'Kecamatan Tapos, Kota Depok').trim();
    const requestedGeoScope = body?.geoScope || {
      type: 'AUTO_DETECT',
      preferredRegencies: [
        'Kota Depok',
        'Kota Bogor',
        'Kabupaten Bogor',
        'Kota Bekasi',
        'Kabupaten Bekasi',
        'Kota Tangerang',
        'Kota Tangerang Selatan',
        'Kabupaten Tangerang',
        'DKI Jakarta',
      ],
    };

    const { agentsDir, queuePath, scrapedLeadsPath } = getScrapePaths();
    await fs.mkdir(agentsDir, { recursive: true });

    const { leads: currentRepoLeads } = await listAllLeadsFromRepo();
    const existingKeySet = new Set();

    for (const l of currentRepoLeads) {
      existingKeySet.add(normalizeLeadKey(l.name, l.address));
      const pk = normalizePhoneKey(l.phone, l.whatsapp);
      if (pk) existingKeySet.add(pk);
    }

    const jobId = `scrape_${Date.now()}`;
    const requestedAt = new Date().toISOString();

    await fs.writeFile(
      queuePath,
      JSON.stringify(
        {
          jobId,
          targetQuery,
          geoScope: requestedGeoScope,
          onlyNoWebsite: false,
          requestedAt,
          outputFile: scrapedLeadsPath,
        },
        null,
        2
      ),
      'utf8'
    );

    let candidates = [];
    let summary = null;
    try {
      const diskRaw = await fs.readFile(scrapedLeadsPath, 'utf8');
      const parsed = JSON.parse(diskRaw);
      if (parsed?.summary) summary = parsed.summary;
      if (Array.isArray(parsed?.leads) && parsed.leads.length > 0) {
        candidates.push(...parsed.leads);
      }
    } catch {
      // Ignore if not present
    }

    const osmLeads = await tryLiveOsmNominatimScrape(targetQuery);
    candidates.push(...osmLeads);

    // Deep-verify candidates & filter out-of-scope offline stores
    const verifiedCandidates = [];
    for (const item of candidates) {
      if (!item?.name) continue;

      // Verify website status if unknown
      if (item.website && !item.websiteStatus) {
        const v = await verifyWebsiteTarget(item.website);
        item.websiteStatus = v.status;
        if (v.isDead) {
          item.deadWebsiteUrl = item.website;
        }
      }

      // Check geographic eligibility
      const geo = evaluateGeographicEligibility(item);
      item.geoScope = geo.scope;
      item.language = geo.language;

      // Skip offline physical stores outside Jabodetabek (requires face-to-face trust)
      if (geo.eligible === false && geo.scope === 'OUTSIDE_OFFLINE_SCOPE') {
        continue;
      }

      verifiedCandidates.push(item);
    }

    const mappedCandidates = verifiedCandidates.map((item, idx) =>
      mapMuseScrapedRecordToLead(item, idx, requestedAt)
    );

    const newOnes = [];
    for (const item of mappedCandidates) {
      if (!item?.name) continue;
      const idKey = normalizeLeadKey(item.name, item.address);
      const pk = normalizePhoneKey(item.phone, item.whatsapp);
      if (existingKeySet.has(idKey) || (pk && existingKeySet.has(pk))) {
        continue;
      }
      existingKeySet.add(idKey);
      if (pk) existingKeySet.add(pk);
      newOnes.push(item);
    }

    const { insertedLeads, insertedCount } = await upsertScrapedLeadsToRepo(
      newOnes.length > 0 ? newOnes : mappedCandidates
    );

    const { leads: updatedAllLeads } = await listAllLeadsFromRepo();

    return NextResponse.json({
      success: true,
      jobId,
      targetQuery,
      scrapedCount: insertedCount || insertedLeads.length,
      totalInRepo: updatedAllLeads.length,
      summary,
      leads: insertedLeads,
      allLeads: updatedAllLeads,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err?.message || 'Gagal menjalankan scraping lokasi via Muse.ai.',
      },
      { status: 500 }
    );
  }
}
