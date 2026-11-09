import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyWebsiteUrl,
  evaluateLeadQualification,
  groupDeleteRecommendations,
  isJabodetabekAddress,
  evaluateGeographicEligibility,
  verifyWebsiteTarget,
} from './leadQualification.js';

test('classifyWebsiteUrl separates owned domains from bio-links, marketplaces, free builders, and aggregators', () => {
  assert.equal(classifyWebsiteUrl(''), 'NONE');
  assert.equal(classifyWebsiteUrl('https://linktr.ee/kopisenja'), 'SOCIAL');
  assert.equal(classifyWebsiteUrl('https://shopee.co.id/tokomawar'), 'MARKETPLACE');
  assert.equal(classifyWebsiteUrl('https://tokomawar.blogspot.com'), 'FREE_BUILDER');
  assert.equal(classifyWebsiteUrl('https://katalogku.my.canva.site'), 'FREE_BUILDER');
  assert.equal(classifyWebsiteUrl('https://www.traveloka.com/id-id/hotel/detail'), 'AGGREGATOR');
  assert.equal(classifyWebsiteUrl('https://kopisenja.co.id'), 'OWNED_DOMAIN');
});

test('isJabodetabekAddress accurately recognizes Jabodetabek regencies and rejects others', () => {
  assert.equal(isJabodetabekAddress('Jl. Raya Tapos No. 12, Kota Depok, Jawa Barat'), true);
  assert.equal(isJabodetabekAddress('Ruko Boulevard Bintaro Jaya, Tangerang Selatan'), true);
  assert.equal(isJabodetabekAddress('Jl. Pajajaran No. 45, Kota Bogor'), true);
  assert.equal(isJabodetabekAddress('Jl. Ahmad Yani, Bekasi Barat, Kota Bekasi'), true);
  assert.equal(isJabodetabekAddress('Jl. Malioboro No. 5, Kota Yogyakarta'), false);
  assert.equal(isJabodetabekAddress('Jl. Tunjungan No. 10, Surabaya'), false);
});

test('evaluateGeographicEligibility locks offline stores to Jabodetabek and allows deliverable/international leads with English', () => {
  // Offline store in Jabodetabek -> eligible, Indonesian
  const localShop = evaluateGeographicEligibility({
    name: 'Bengkel Motor Berkah Jaya',
    categoryName: 'Bengkel Motor',
    address: 'Jl. Raya Sawangan No. 8, Kota Depok',
  });
  assert.equal(localShop.eligible, true);
  assert.equal(localShop.scope, 'JABODETABEK');
  assert.equal(localShop.language, 'id');

  // Offline store outside Jabodetabek -> disqualified for face-to-face trust requirement
  const distantOfflineShop = evaluateGeographicEligibility({
    name: 'Bengkel Las Mandiri',
    categoryName: 'Bengkel Las & Bubut',
    address: 'Jl. Pemuda No. 12, Semarang, Jawa Tengah',
  });
  assert.equal(distantOfflineShop.eligible, false);
  assert.equal(distantOfflineShop.scope, 'OUTSIDE_OFFLINE_SCOPE');

  // Deliverable / national scope (Konveksi, Sablon) outside Jabodetabek -> eligible
  const deliverableShop = evaluateGeographicEligibility({
    name: 'Konveksi Kaos Bandung Juara',
    categoryName: 'Konveksi Kaos & Sablon',
    address: 'Jl. Supratman No. 20, Bandung',
  });
  assert.equal(deliverableShop.eligible, true);
  assert.equal(deliverableShop.scope, 'NATIONAL');
  assert.equal(deliverableShop.language, 'id');

  // International prospect -> eligible with English only
  const overseasLead = evaluateGeographicEligibility({
    name: 'Singa Apparel Sourcing',
    categoryName: 'Apparel Wholesaler',
    address: '10 Bayfront Ave, Singapore',
    phone: '+6591234567',
  });
  assert.equal(overseasLead.eligible, true);
  assert.equal(overseasLead.scope, 'INTERNATIONAL');
  assert.equal(overseasLead.language, 'en');
});

test('verifyWebsiteTarget identifies dead websites, social-only, and active owned sites', async () => {
  // Empty url
  const empty = await verifyWebsiteTarget('');
  assert.equal(empty.status, 'no_website');
  assert.equal(empty.hasWebsite, false);

  // Social only
  const social = await verifyWebsiteTarget('https://www.instagram.com/tokosablon');
  assert.equal(social.status, 'social_only');
  assert.equal(social.hasWebsite, false);

  // Dead website (mock fetch 404/network error)
  const deadFetch = async () => ({ ok: false, status: 404 });
  const deadWeb = await verifyWebsiteTarget('https://domain-mati-12345.com', { fetchImpl: deadFetch });
  assert.equal(deadWeb.status, 'website_dead');
  assert.equal(deadWeb.hasWebsite, false);
  assert.equal(deadWeb.isDead, true);

  // Active owned website (mock fetch 200)
  const activeFetch = async () => ({ ok: true, status: 200 });
  const activeWeb = await verifyWebsiteTarget('https://perusahaan-aktif.co.id', { fetchImpl: activeFetch });
  assert.equal(activeWeb.status, 'has_website');
  assert.equal(activeWeb.hasWebsite, true);
  assert.equal(activeWeb.isDead, false);
});

test('evaluateLeadQualification marks owned websites, closed businesses, franchises, and contact-less leads for deletion', () => {
  const hasWeb = evaluateLeadQualification({
    name: 'Klinik Gigi Sehat',
    website: 'https://klinikgigisehat.com',
    phone: '08123456789',
  });
  assert.equal(hasWeb.recommendDelete, true);
  assert.equal(hasWeb.reasonCode, 'HAS_OWNED_WEBSITE');

  const closedShop = evaluateLeadQualification({
    name: 'Warung Bakso Pak Kumis (Tutup Permanen)',
    phone: '08123456789',
  });
  assert.equal(closedShop.recommendDelete, true);
  assert.equal(closedShop.reasonCode, 'CLOSED_BUSINESS');

  const franchise = evaluateLeadQualification({
    name: 'Indomaret Raya Pajajaran',
    phone: '0811123456',
  });
  assert.equal(franchise.recommendDelete, true);
  assert.equal(franchise.reasonCode, 'FRANCHISE_OR_INSTITUTION');

  const deadContact = evaluateLeadQualification({
    name: 'Bengkel Las Jaya Mandiri',
    address: 'Jl. Merdeka 10',
    phone: '',
    whatsapp: '',
    socialMedia: '',
    onlineShop: '',
  });
  assert.equal(deadContact.recommendDelete, true);
  assert.equal(deadContact.reasonCode, 'NO_CONTACT_CHANNEL');

  const aiCold = evaluateLeadQualification({
    name: 'Kantor Cabang Korporat',
    phone: '0215551234',
    aiResearch: { leadQualification: 'COLD LEAD', leadScore: 22 },
  });
  assert.equal(aiCold.recommendDelete, true);
  assert.equal(aiCold.reasonCode, 'AI_DISQUALIFIED_COLD');
});

test('evaluateLeadQualification keeps free-builder and social-only active UMKM leads as PRIME prospects', () => {
  const canvaLead = evaluateLeadQualification({
    name: 'Catering Dapur Ibu Rina',
    categoryName: 'Jasa Katering',
    website: 'https://dapuriburina.my.canva.site',
    phone: '081388889999',
    rating: '4.8',
    reviewCount: '64',
  });
  assert.equal(canvaLead.recommendDelete, false);
  assert.equal(canvaLead.tier, 'PRIME');

  const grouped = groupDeleteRecommendations([
    { id: 1, name: 'Catering Dapur Ibu Rina', phone: '081388889999' },
    { id: 2, name: 'Alfamart Sudirman', phone: '08110000' },
    { id: 3, name: 'Studio Foto Cahaya', website: 'https://studiofotocahaya.id', phone: '08120000' },
  ]);
  assert.equal(grouped.totalFlagged, 2);
  assert.equal(grouped.groups.length, 2);
});

