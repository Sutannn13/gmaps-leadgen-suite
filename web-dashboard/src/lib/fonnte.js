// Rationale: Fonnte WhatsApp API gateway client with self-echo guard, token fallback from .agents/fonnte-config.json, and atomic send verification.

import fs from 'node:fs/promises';
import path from 'node:path';

export const FONNTE_SEND_URL = 'https://api.fonnte.com/send';
export const FONNTE_DEVICE_URL = 'https://api.fonnte.com/device';

const BOT_OUTBOUND_SIGNATURES = [
  'salam kenal dari tim developer kodekiri',
  'profil dan portofolio tim kami bisa dicek di https://kodekiri.tech',
  'tim developer kodekiri sedang menyiapkan gambaran tampilan web singkat',
  'ini gambaran tampilan website singkat untuk',
  'mode pratinjau desain oleh tim developer kodekiri',
  'izin menyapa kembali dari tim developer kodekiri',
];

export function isBotOwnOutboundEcho(messageText = '', payload = {}) {
  if (
    payload?.fromMe === true ||
    payload?.from_me === true ||
    payload?.isMe === true ||
    String(payload?.fromMe || '').toLowerCase() === 'true'
  ) {
    return true;
  }

  const lower = String(messageText || '').toLowerCase().trim();
  if (!lower) return false;

  return BOT_OUTBOUND_SIGNATURES.some((sig) => lower.includes(sig));
}

export function normalizeFonnteTarget(phone = '') {
  let digits = String(phone || '').replace(/[^\d]/g, '');
  if (digits.startsWith('62')) {
    digits = '0' + digits.slice(2);
  } else if (digits.startsWith('8')) {
    digits = '0' + digits;
  }
  return digits;
}

export function resolveFonnteToken(explicitToken = '') {
  return String(
    explicitToken ||
      process.env.FONNTE_TOKEN ||
      process.env.NEXT_PUBLIC_FONNTE_TOKEN ||
      ''
  ).trim();
}

export async function resolveFonnteTokenAsync(explicitToken = '') {
  const syncToken = resolveFonnteToken(explicitToken);
  if (syncToken) return syncToken;

  try {
    const repoRoot = path.resolve(process.cwd(), '..');
    const cfgPath = path.join(repoRoot, '.agents', 'fonnte-config.json');
    const raw = await fs.readFile(cfgPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed?.token) return String(parsed.token).trim();
  } catch {
    // Ignore missing config file
  }
  return '';
}

export async function checkFonnteDeviceStatus(
  rawToken = '',
  { fetchImpl = globalThis.fetch, timeoutMs = 10000 } = {}
) {
  const token = await resolveFonnteTokenAsync(rawToken);
  if (!token) {
    return {
      ok: false,
      connected: false,
      reason: 'Token Fonnte belum diisi.',
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchImpl(FONNTE_DEVICE_URL, {
      method: 'POST',
      headers: {
        Authorization: token,
      },
      signal: controller.signal,
    });

    const data = await res.json().catch(() => ({}));
    const deviceStatus = String(data?.device_status || data?.status || '').toLowerCase();
    const isConnected = deviceStatus === 'connect' || deviceStatus === 'connected';

    return {
      ok: Boolean(res.ok && data?.status !== false),
      connected: isConnected,
      deviceStatus: data?.device_status || (data?.status ? 'ready' : 'disconnected'),
      deviceName: data?.name || 'KodeKiri',
      deviceNumber: data?.device || '',
      quota: data?.quota ?? null,
      expired: data?.expired || '',
      raw: data,
    };
  } catch (err) {
    return {
      ok: false,
      connected: false,
      reason: err?.message || 'Gagal menghubungi server Fonnte.',
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function sendWhatsAppViaFonnte(
  { target, message, token: rawToken = '', delay = '2-4' } = {},
  { fetchImpl = globalThis.fetch, timeoutMs = 15000 } = {}
) {
  const token = await resolveFonnteTokenAsync(rawToken);
  const cleanTarget = normalizeFonnteTarget(target);
  const cleanMessage = String(message || '').trim();

  if (!token) {
    return {
      ok: false,
      sent: false,
      tokenConfigured: false,
      reason: 'Token Fonnte belum dikonfigurasi.',
    };
  }

  if (!cleanTarget || cleanTarget.length < 9) {
    return {
      ok: false,
      sent: false,
      tokenConfigured: true,
      reason: `Nomor tujuan WhatsApp tidak valid (${target || '-'}).`,
    };
  }

  if (!cleanMessage) {
    return {
      ok: false,
      sent: false,
      tokenConfigured: true,
      reason: 'Isi pesan WhatsApp kosong.',
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const formBody = new URLSearchParams();
    formBody.set('target', cleanTarget);
    formBody.set('message', cleanMessage);
    formBody.set('countryCode', '62');
    if (delay) formBody.set('delay', String(delay));

    const res = await fetchImpl(FONNTE_SEND_URL, {
      method: 'POST',
      headers: {
        Authorization: token,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formBody.toString(),
      signal: controller.signal,
    });

    const data = await res.json().catch(() => ({}));
    const sentOk = Boolean(res.ok && data?.status === true);

    return {
      ok: sentOk,
      sent: sentOk,
      tokenConfigured: true,
      target: cleanTarget,
      detail:
        data?.detail ||
        data?.reason ||
        (sentOk ? 'Pesan terkirim via Fonnte.' : 'Gagal mengirim via Fonnte.'),
      id: data?.id || null,
      raw: data,
    };
  } catch (err) {
    return {
      ok: false,
      sent: false,
      tokenConfigured: true,
      target: cleanTarget,
      reason: err?.message || 'Gagal menghubungi endpoint Fonnte.',
    };
  } finally {
    clearTimeout(timer);
  }
}
