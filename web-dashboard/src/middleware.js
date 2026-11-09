import { NextResponse } from 'next/server';

function safeCompareSecret(provided, configured) {
  if (typeof provided !== 'string' || typeof configured !== 'string') return false;
  let mismatch = provided.length === configured.length ? 0 : 1;
  const len = Math.max(provided.length, configured.length);
  for (let i = 0; i < len; i++) {
    const a = provided.charCodeAt(i % (provided.length || 1)) || 0;
    const b = configured.charCodeAt(i % (configured.length || 1)) || 0;
    mismatch |= a ^ b;
  }
  return mismatch === 0;
}

const PROTECTED_API_PATHS = [
  '/api/delete',
  '/api/delete-all',
  '/api/delete-batch',
  '/api/import',
  '/api/leads/ai',
  '/api/leads/chat-status',
  '/api/ai/deepseek',
  '/api/ai/openrouter',
  '/api/ai/settings',
  '/api/ai/muse-queue',
  '/api/ai/muse-research',
  '/api/ai/muse-scrape',
  '/api/automation/control',
  '/api/automation/tick',
];

export function middleware(request) {
  const path = request.nextUrl.pathname;
  const isAuthenticated = request.cookies.has('auth');

  // Allow webhook / agent / cron authentication via x-muse-secret or Bearer token
  const configuredSecret =
    process.env.MUSE_BRIDGE_SECRET ||
    process.env.MUSE_WEBHOOK_SECRET ||
    'kodekiri_muse_secret_key';
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret =
    request.headers.get('x-muse-secret') ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const isAgentAuthorized = Boolean(
    providedSecret && (
      safeCompareSecret(providedSecret, configuredSecret) ||
      (cronSecret && safeCompareSecret(providedSecret, cronSecret))
    )
  );

  const isProtectedApi = PROTECTED_API_PATHS.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  );
  if (isProtectedApi && !isAuthenticated && !isAgentAuthorized) {
    return NextResponse.json(
      { success: false, error: 'Autentikasi diperlukan. Sertakan cookie login atau header x-muse-secret.' },
      { status: 401 }
    );
  }

  // Lindungi halaman dashboard dan import dengan autentikasi
  const isProtectedPage = path === '/' || path.startsWith('/import');
  if (isProtectedPage && !isAuthenticated) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (path === '/login' && isAuthenticated) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|zip)$).*)'],
};
