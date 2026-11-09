import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_OPENROUTER_MODEL,
  ensureFreeModelId,
  filterFreeModels,
  humanizeGeneratedText,
  DEFAULT_MUSE_MODEL,
  extractBusinessIdentity,
  buildDefaultWaPitch,
  buildGroundedMuseResearch,
  analyzeLeadWithMuse,
  buildQualificationReplyDraft,
  buildMuseMockupBridgePrompt,
  buildLeadPrompt,
  parseAiResearchResponse,
  analyzeLeadWithAi,
  analyzeLeadWithOpenRouter,
  resolveActiveProvider,
} from './openrouter.js';

test('filterFreeModels keeps only zero-cost :free models and pins openrouter/free first', () => {
  const catalog = [
    {
      id: 'openai/gpt-4o',
      name: 'OpenAI: GPT-4o',
      pricing: { prompt: '0.0000025', completion: '0.00001' },
    },
    {
      id: 'meta-llama/llama-3.3-70b-instruct:free',
      name: 'Meta: Llama 3.3 70B',
      pricing: { prompt: '0', completion: '0' },
      context_length: 128000,
    },
    {
      id: 'spoofed/paid-disguised:free',
      name: 'Spoofed Paid Model',
      pricing: { prompt: '0.0001', completion: '0' },
    },
  ];

  const filtered = filterFreeModels(catalog);
  assert.equal(filtered.length, 2);
  assert.equal(filtered[0].id, DEFAULT_OPENROUTER_MODEL);
  assert.equal(filtered[1].id, 'meta-llama/llama-3.3-70b-instruct:free');
  assert.equal(ensureFreeModelId('openai/gpt-4o'), DEFAULT_OPENROUTER_MODEL);
});

test('humanizeGeneratedText strips double dashes, em-dashes, and emojis while preserving Indonesian reduplicated words', () => {
  const dirty =
    'Halo Kak \uD83D\uDE80 -- kami lihat produk-produk Roti Mawar sangat ramai \u2014 ulasan rata-rata 4.8 - tapi belum ada katalog web resmi.';
  const cleaned = humanizeGeneratedText(dirty);

  assert.ok(!cleaned.includes('--'));
  assert.ok(!cleaned.includes('\u2014'));
  assert.ok(!cleaned.includes(' - '));
  assert.ok(!cleaned.includes('\uD83D\uDE80'));
  assert.ok(cleaned.includes('produk-produk'));
  assert.ok(cleaned.includes('rata-rata'));
});

test('parseAiResearchResponse strips reasoning blocks, markdown fences, and sanitizes dashes in output', () => {
  const raw = `<think>Evaluating business signals...</think>
\`\`\`json
{
  "leadQualification": "hot lead",
  "leadScore": 91.6,
  "opportunityType": "Website Katalog Mandiri",
  "digitalPresenceSummary": "Toko memiliki 420 ulasan positif -- aktif di Shopee \u2014 namun belum memiliki domain website sendiri.",
  "pitchAngle": "Bantu hemat potongan biaya admin marketplace dengan katalog order langsung.",
  "pitchDraft": "Halo Kak -- salam kenal. Kami lihat produk-produk toko Kakak sudah punya 420+ ulasan bagus di Maps \u2014 boleh kami kirim contoh katalognya?",
  "followUpDraft": "Halo Kak -- izin menyapa kembali terkait contoh katalog websitenya."
}
\`\`\`
Semoga membantu!`;

  const res = parseAiResearchResponse(raw, 'deepseek/deepseek-chat');
  assert.equal(res.leadQualification, 'HOT LEAD');
  assert.equal(res.leadScore, 92);
  assert.equal(res.modelUsed, 'deepseek/deepseek-chat');
  assert.ok(res.pitchDraft.includes('420+'));
  assert.ok(res.pitchDraft.includes('produk-produk'));
  assert.ok(!res.pitchDraft.includes('--'));
  assert.ok(!res.pitchDraft.includes('\u2014'));
  assert.ok(!res.digitalPresenceSummary.includes('--'));
  assert.ok(!res.followUpDraft.includes('--'));
});

test('buildLeadPrompt enforces anti-hallucination and bans double dashes without containing em-dashes itself', () => {
  const { systemPrompt, userPrompt } = buildLeadPrompt({
    name: 'Bengkel Mobil Jaya',
    categoryName: 'Bengkel Mobil',
    website: 'https://bengkeljaya.blogspot.com',
    rating: '4.7',
    reviewCount: '85',
    phone: '08123456789',
  });

  assert.ok(systemPrompt.includes('DILARANG KERAS menggunakan tanda double dash'));
  assert.ok(!systemPrompt.includes('\u2014'));
  assert.ok(userPrompt.includes('SUBDOMAIN GRATISAN'));
});

test('resolveActiveProvider supports both local keys and shared Cloud Neon readiness flags', () => {
  assert.equal(
    resolveActiveProvider({
      primaryProvider: 'deepseek',
      deepseekApiKey: '',
      cloudDeepseekReady: false,
      cloudOpenrouterReady: true,
    }),
    'openrouter'
  );
  assert.equal(
    resolveActiveProvider({
      primaryProvider: 'deepseek',
      deepseekApiKey: '',
      cloudDeepseekReady: true,
      cloudOpenrouterReady: true,
    }),
    'deepseek'
  );
});

test('analyzeLeadWithAi supports Cloud Neon keys and auto-falls back from DeepSeek to OpenRouter proxy on 402', async () => {
  const lead = { name: 'Toko Roti Mawar', address: 'Bandung' };
  const calls = [];

  const mockFetch = async (url) => {
    calls.push(url);
    if (url === '/api/ai/deepseek') {
      return {
        ok: false,
        status: 402,
        json: async () => ({
          success: false,
          code: 'INSUFFICIENT_BALANCE',
          error: 'Saldo DeepSeek habis',
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        model: 'google/gemma-3-27b-it:free',
        content: JSON.stringify({
          leadQualification: 'HOT LEAD',
          leadScore: 88,
          opportunityType: 'Website Katalog',
          digitalPresenceSummary: 'Aktif di Maps tanpa website.',
          pitchAngle: 'Katalog online mandiri.',
          pitchDraft: 'Halo Kak Toko Roti Mawar, salam kenal.',
          followUpDraft: 'Halo Kak, izin menyapa kembali.',
        }),
      }),
    };
  };

  const res = await analyzeLeadWithAi(
    lead,
    {
      primaryProvider: 'deepseek',
      autoFallback: true,
      cloudDeepseekReady: true,
      cloudOpenrouterReady: true,
    },
    { fetchImpl: mockFetch }
  );

  assert.equal(calls.length, 2);
  assert.equal(calls[0], '/api/ai/deepseek');
  assert.equal(calls[1], '/api/ai/openrouter');
  assert.equal(res.providerUsed, 'openrouter');
  assert.equal(res.fallbackFrom, 'deepseek');
  assert.equal(res.leadQualification, 'HOT LEAD');
});

test('analyzeLeadWithOpenRouter fails fast on missing API key and surfaces 429 rate-limit clearly', async () => {
  const lead = { name: 'Toko Roti Mawar', address: 'Bandung' };

  await assert.rejects(
    () => analyzeLeadWithOpenRouter(lead, { openrouterApiKey: '   ', cloudOpenrouterReady: false }),
    (err) => err.code === 'MISSING_API_KEY' && err.retryable === false
  );

  const mock429Fetch = async () => ({
    ok: false,
    status: 429,
    json: async () => ({ error: { message: 'Rate limit exceeded' } }),
  });

  await assert.rejects(
    () =>
      analyzeLeadWithOpenRouter(
        lead,
        { openrouterApiKey: 'sk-or-v1-test', openrouterModel: 'openai/gpt-4o' },
        { fetchImpl: mock429Fetch }
      ),
    (err) => err.code === 'RATE_LIMITED' && err.status === 429 && err.retryable === true
  );
});

test('extractBusinessIdentity and buildDefaultWaPitch clean SEO-stuffed store names and use Tim Developer KodeKiri', async () => {
  const seoLead = {
    name: 'Ofcourse.apparel | Jasa Sablon DTF dan Plastisol Terdekat Di Depok | Sablon Kaos Satuan',
    categoryName: 'Jasa Sablon',
    address: 'Depok, Jawa Barat',
    phone: '081210670001',
    rating: '4.9',
    reviewCount: '124',
  };

  const identity = extractBusinessIdentity(seoLead.name, seoLead.categoryName, seoLead.address);
  assert.equal(identity.cleanBrandName, 'Ofcourse Apparel');
  assert.ok(identity.extractedSpecialty.toLowerCase().includes('sablon dtf'));
  assert.equal(identity.nicheBucket, 'SABLON_KONVEKSI');

  const chat1 = buildDefaultWaPitch(seoLead);
  assert.ok(chat1.includes('Halo Kak, admin Ofcourse Apparel ya?'));
  assert.ok(chat1.includes('Tim Developer KodeKiri'));
  assert.ok(!chat1.includes('|'));
  assert.ok(!chat1.includes('https://'));
  assert.ok(chat1.includes('buatkan gambaran tampilan web singkat'));

  const chat2 = buildQualificationReplyDraft(seoLead);
  assert.ok(chat2.includes('https://kodekiri.tech'));
  assert.ok(chat2.includes('Ofcourse Apparel'));

  // Test International English outreach
  const internationalLead = {
    name: 'Melbourne Coffee Roasters',
    categoryName: 'Coffee Roastery',
    address: 'Melbourne, Australia',
    phone: '+61412345678',
    language: 'en',
    geoScope: 'INTERNATIONAL',
  };
  const intlChat1 = buildDefaultWaPitch(internationalLead);
  assert.ok(intlChat1.includes('Hi there, reaching out from Tim Developer KodeKiri'));
  assert.ok(intlChat1.includes('Melbourne Coffee Roasters'));
  assert.ok(intlChat1.includes('one-page'));
  assert.ok(!intlChat1.includes('Halo Kak'));

  const intlChat2 = buildQualificationReplyDraft(internationalLead);
  assert.ok(intlChat2.includes('https://kodekiri.tech'));
  assert.ok(intlChat2.includes('Melbourne Coffee Roasters'));
  assert.ok(!intlChat2.includes('Siap Kak'));

  const musePrompt = buildMuseMockupBridgePrompt(seoLead, {
    clientNotes: 'Sablon DTF & plastisol lusinan',
    referenceUrl: 'https://contoh-sablon-premium.com',
  });
  assert.ok(musePrompt.includes('ZERO REFERENCE LEAK'));
  assert.ok(musePrompt.includes('ZERO DUMMY ADDRESS/CONTACT'));
  assert.ok(musePrompt.includes('ZERO FABRICATED PRICING'));
  assert.ok(musePrompt.includes('MAKSIMAL 4 SECTION'));
  assert.ok(musePrompt.includes('Tim Developer KodeKiri'));

  // Test Muse.ai default provider & grounded research without external API keys
  assert.equal(resolveActiveProvider({}), 'muse');
  const museResearch = buildGroundedMuseResearch(seoLead);
  assert.equal(museResearch.leadQualification, 'HOT LEAD');
  assert.equal(museResearch.hasOfficialWebsite, false);
  assert.equal(museResearch.modelUsed, DEFAULT_MUSE_MODEL);
  assert.ok(museResearch.pitchDraft.includes('Ofcourse Apparel'));

  const museViaApi = await analyzeLeadWithMuse(
    seoLead,
    {},
    {
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          aiResearch: museResearch,
        }),
      }),
    }
  );
  assert.equal(museViaApi.leadQualification, 'HOT LEAD');
  assert.equal(museViaApi.modelUsed, DEFAULT_MUSE_MODEL);
});
