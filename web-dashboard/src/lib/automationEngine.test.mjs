import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isWithinOperatingWindow,
  deriveLeadPipelineStage,
  classifyIncomingClientReply,
  filterEligibleAutopilotLeads,
  computeHumanJitterDelayMs,
  evaluateAutopilotTick,
} from './automationEngine.js';

test('isWithinOperatingWindow enforces 07:00 to 13:00 WIB (Asia/Jakarta) window strictly', () => {
  // 06:59 WIB = 23:59 UTC previous day
  const before7Wib = new Date('2026-11-07T23:59:00.000Z');
  const checkBefore = isWithinOperatingWindow(before7Wib, 7, 13);
  assert.equal(checkBefore.allowed, false);
  assert.equal(checkBefore.hour, 6);
  assert.equal(checkBefore.minute, 59);

  // 07:00 WIB = 00:00 UTC
  const at7Wib = new Date('2026-11-08T00:00:00.000Z');
  const checkStart = isWithinOperatingWindow(at7Wib, 7, 13);
  assert.equal(checkStart.allowed, true);
  assert.equal(checkStart.hour, 7);

  // 12:59 WIB = 05:59 UTC
  const before13Wib = new Date('2026-11-08T05:59:00.000Z');
  const checkMid = isWithinOperatingWindow(before13Wib, 7, 13);
  assert.equal(checkMid.allowed, true);
  assert.equal(checkMid.hour, 12);

  // 13:00 WIB = 06:00 UTC -> must stop automatically at 13:00 WIB
  const at13Wib = new Date('2026-11-08T06:00:00.000Z');
  const checkAfter = isWithinOperatingWindow(at13Wib, 7, 13);
  assert.equal(checkAfter.allowed, false);
  assert.equal(checkAfter.hour, 13);
});

test('classifyIncomingClientReply transitions stages and triggers HANDOVER_TO_HUMAN on pricing/closing', () => {
  const positive = classifyIncomingClientReply('Boleh kak liat contohnya', 'CHAT1_SENT');
  assert.equal(positive.intent, 'POSITIVE_INTEREST');
  assert.equal(positive.nextStage, 'QUALIFYING');
  assert.equal(positive.botPaused, false);

  const clientInfo = classifyIncomingClientReply(
    'Kami paling sering sablon DTF dan plastisol lusinan kak, logo menyusul ya',
    'QUALIFYING'
  );
  assert.equal(clientInfo.intent, 'CLIENT_INFO_PROVIDED');
  assert.equal(clientInfo.nextStage, 'MOCKUP_SENT');
  assert.ok(clientInfo.extractedClientNotes.includes('DTF'));

  const closingQuestion = classifyIncomingClientReply(
    'Tampilannya cocok kak, kalau lanjut aktifkan domain resmi berapa harganya?',
    'MOCKUP_SENT'
  );
  assert.equal(closingQuestion.intent, 'HANDOVER_CLOSING');
  assert.equal(closingQuestion.nextStage, 'HANDOVER_TO_HUMAN');
  assert.equal(closingQuestion.botPaused, true);

  const declined = classifyIncomingClientReply('Maaf kak belum butuh saat ini', 'CHAT1_SENT');
  assert.equal(declined.intent, 'DECLINE');
  assert.equal(declined.nextStage, 'DECLINED');
  assert.equal(declined.botPaused, true);
});

test('filterEligibleAutopilotLeads excludes businesses with owned websites, landlines-only, or paused bots', () => {
  const leads = [
    {
      id: '1',
      name: 'Ofcourse.apparel | Jasa Sablon DTF Depok',
      categoryName: 'Jasa Sablon',
      phone: '081210670001',
      website: '',
    },
    {
      id: '2',
      name: 'PT Konveksi Sudah Punya Web',
      categoryName: 'Konveksi',
      phone: '081299998888',
      website: 'https://konveksiresmi.co.id',
    },
    {
      id: '3',
      name: 'Toko Telepon Rumah Saja',
      categoryName: 'Toko Baju',
      phone: '02177889900',
      website: '',
    },
    {
      id: '4',
      name: 'Sablon Sedang Closing Manual',
      categoryName: 'Jasa Sablon',
      phone: '081355556666',
      website: '',
      aiResearch: {
        pipelineStage: 'HANDOVER_TO_HUMAN',
        botPaused: true,
      },
    },
  ];

  const eligible = filterEligibleAutopilotLeads(leads, 10);
  assert.equal(eligible.length, 1);
  assert.equal(eligible[0].lead.id, '1');
  assert.equal(eligible[0].identity.cleanBrandName, 'Ofcourse Apparel');
  assert.equal(deriveLeadPipelineStage(eligible[0].lead), 'QUEUED');

  const jitter = computeHumanJitterDelayMs(8, 15, () => 0.5);
  assert.equal(jitter, Math.round(11.5 * 60 * 1000));

  // Monotonic stage promotion: if lead was in QUALIFYING and museShareUrl arrives, stage promotes to MOCKUP_SENT
  assert.equal(
    deriveLeadPipelineStage({
      aiResearch: {
        pipelineStage: 'QUALIFYING',
        museShareUrl: 'https://muse.ai/s/mockup-test',
      },
    }),
    'MOCKUP_SENT'
  );

  // Sticky terminal stages: HANDOVER_TO_HUMAN and DECLINED remain sticky even when museShareUrl is present
  assert.equal(
    deriveLeadPipelineStage({
      aiResearch: {
        pipelineStage: 'HANDOVER_TO_HUMAN',
        museShareUrl: 'https://muse.ai/s/mockup-test',
      },
    }),
    'HANDOVER_TO_HUMAN'
  );
});

test('evaluateAutopilotTick enforces all 4 gates: enabled, 07:00-13:00 WIB window, daily quota, and human jitter cooldown', () => {
  const sampleLeads = [
    {
      id: 'tapos-001',
      name: 'Sablon Kaos Tapos Depok',
      categoryName: 'Sablon/Konveksi/Percetakan',
      address: 'Sukamaju Baru, Kec. Tapos, Kota Depok',
      phone: '0822-9798-4472',
      whatsapp: '0822-9798-4472',
      website: '',
      chatStatus: 'BELUM',
    },
  ];

  // 1. Disabled gate
  const offRes = evaluateAutopilotTick({
    state: { enabled: false },
    leads: sampleLeads,
    now: new Date('2026-11-09T01:00:00.000Z'), // 08:00 WIB
  });
  assert.equal(offRes.allowed, false);
  assert.equal(offRes.gateCode, 'DISABLED');

  // 2. Outside operating hours gate (23:30 WIB = 16:30 UTC)
  const nightRes = evaluateAutopilotTick({
    state: { enabled: true, startHourWib: 7, endHourWib: 13 },
    leads: sampleLeads,
    now: new Date('2026-11-08T16:30:00.000Z'),
  });
  assert.equal(nightRes.allowed, false);
  assert.equal(nightRes.gateCode, 'OUTSIDE_OPERATING_HOURS');

  // 3. Quota reached gate at 08:30 WIB (01:30 UTC)
  const quotaRes = evaluateAutopilotTick({
    state: {
      enabled: true,
      sentDateKey: '2026-11-09',
      sentTodayCount: 20,
      maxDailyQuota: 20,
    },
    leads: sampleLeads,
    now: new Date('2026-11-09T01:30:00.000Z'),
  });
  assert.equal(quotaRes.allowed, false);
  assert.equal(quotaRes.gateCode, 'QUOTA_REACHED');

  // 4. Cooldown jitter gate at 08:30 WIB when nextAllowedSendAt is 08:40 WIB
  const cooldownRes = evaluateAutopilotTick({
    state: {
      enabled: true,
      sentDateKey: '2026-11-09',
      sentTodayCount: 1,
      maxDailyQuota: 20,
      nextAllowedSendAt: '2026-11-09T01:40:00.000Z',
    },
    leads: sampleLeads,
    now: new Date('2026-11-09T01:30:00.000Z'),
  });
  assert.equal(cooldownRes.allowed, false);
  assert.equal(cooldownRes.gateCode, 'COOLDOWN_JITTER');

  // 5. All gates pass at 08:30 WIB (01:30 UTC) -> executes Chat 1 and schedules next jitter
  const execRes = evaluateAutopilotTick({
    state: {
      enabled: true,
      sentDateKey: '2026-11-09',
      sentTodayCount: 1,
      maxDailyQuota: 20,
    },
    leads: sampleLeads,
    now: new Date('2026-11-09T01:30:00.000Z'),
    randomFn: () => 0.5,
  });
  assert.equal(execRes.allowed, true);
  assert.equal(execRes.gateCode, 'EXECUTE_SEND_CHAT1');
  assert.equal(execRes.sentTodayCount, 2);
  assert.equal(execRes.targetLead.id, 'tapos-001');
  assert.ok(execRes.nextAction.whatsappMessage.includes('Tim Developer KodeKiri'));
});

test('End-to-End Pipeline: Muse.ai verified leads feed directly into Autopilot with language & geo rules', () => {
  const verifiedMuseLeads = [
    {
      id: 'depok-shop-01',
      name: 'Bengkel Motor Berkah Sawangan',
      categoryName: 'Bengkel Motor',
      address: 'Jl. Raya Sawangan No. 12, Pancoran Mas, Kota Depok',
      phone: '081288990011',
      whatsapp: '6281288990011',
      website: '',
      websiteStatus: 'no_website',
      geoScope: 'JABODETABEK',
      language: 'id',
      chatStatus: 'BELUM',
    },
    {
      id: 'overseas-b2b-02',
      name: 'Melbourne Apparel Sourcing',
      categoryName: 'Apparel Wholesale',
      address: 'Melbourne, Australia',
      phone: '+61412345678',
      whatsapp: '+61412345678',
      website: '',
      websiteStatus: 'no_website',
      geoScope: 'INTERNATIONAL',
      language: 'en',
      chatStatus: 'BELUM',
    },
    {
      id: 'outside-offline-03',
      name: 'Bengkel Bubut Surabaya Jaya',
      categoryName: 'Bengkel Motor',
      address: 'Jl. Tunjungan No. 88, Surabaya, Jawa Timur',
      phone: '081399887766',
      whatsapp: '6281399887766',
      website: '',
      websiteStatus: 'no_website',
      geoScope: 'OUTSIDE_OFFLINE_SCOPE',
      language: 'id',
      chatStatus: 'BELUM',
    },
    {
      id: 'dead-web-hot-04',
      name: 'Mebel Kayu Jati Tapos',
      categoryName: 'Mebel & Interior',
      address: 'Jl. Raya Tapos No. 20, Kota Depok',
      phone: '081255443322',
      whatsapp: '6281255443322',
      website: '',
      deadWebsiteUrl: 'https://mebelkayujatitapos-lama.com',
      websiteStatus: 'website_dead',
      geoScope: 'JABODETABEK',
      language: 'id',
      chatStatus: 'BELUM',
    },
    {
      id: 'owned-web-skip-05',
      name: 'PT Toko Sudah Punya Web',
      categoryName: 'Toko Elektronik',
      address: 'Jl. Margonda Raya No. 100, Kota Depok',
      phone: '081233221100',
      whatsapp: '6281233221100',
      website: 'https://tokosudahpunyaweb.co.id',
      websiteStatus: 'has_website',
      geoScope: 'JABODETABEK',
      chatStatus: 'BELUM',
    },
  ];

  // 1. Filter eligible: only depok-shop-01, overseas-b2b-02, and dead-web-hot-04 pass
  const eligible = filterEligibleAutopilotLeads(verifiedMuseLeads, 10);
  assert.equal(eligible.length, 3);
  assert.equal(eligible[0].lead.id, 'depok-shop-01');
  assert.equal(eligible[1].lead.id, 'overseas-b2b-02');
  assert.equal(eligible[2].lead.id, 'dead-web-hot-04');

  // 2. Check stage derivation: all start in QUEUED
  assert.equal(eligible[0].stage, 'QUEUED');
  assert.equal(eligible[1].stage, 'QUEUED');
  assert.equal(eligible[2].stage, 'QUEUED');

  // 3. Autopilot execution on local Indonesian lead (09:00 WIB = 02:00 UTC)
  const tickLocal = evaluateAutopilotTick({
    state: { enabled: true, sentTodayCount: 0, maxDailyQuota: 20 },
    leads: [eligible[0].lead],
    now: new Date('2026-11-09T02:00:00.000Z'),
  });
  assert.equal(tickLocal.allowed, true);
  assert.equal(tickLocal.targetLead.id, 'depok-shop-01');
  assert.ok(tickLocal.nextAction.whatsappMessage.includes('Halo Kak, admin Bengkel Motor Berkah Sawangan ya?'));
  assert.ok(!tickLocal.nextAction.whatsappMessage.includes('Hi there'));

  // 4. Autopilot execution on International lead (English only)
  const tickIntl = evaluateAutopilotTick({
    state: { enabled: true, sentTodayCount: 1, maxDailyQuota: 20 },
    leads: [eligible[1].lead],
    now: new Date('2026-11-09T02:00:00.000Z'),
  });
  assert.equal(tickIntl.allowed, true);
  assert.equal(tickIntl.targetLead.id, 'overseas-b2b-02');
  assert.ok(tickIntl.nextAction.whatsappMessage.includes('Hi there, reaching out from Tim Developer KodeKiri'));
  assert.ok(tickIntl.nextAction.whatsappMessage.includes('Melbourne Apparel Sourcing'));
  assert.ok(!tickIntl.nextAction.whatsappMessage.includes('Halo Kak'));
});
