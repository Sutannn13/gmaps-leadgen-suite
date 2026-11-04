import { NextResponse } from 'next/server';

const PROTECTED_API_PATHS = [
  '/api/delete',
  '/api/delete-all',
  '/api/delete-batch',
  '/api/leads/ai',
  '/api/leads/chat-status',
  '/api/ai/deepseek',
  '/api/ai/openrouter',
  '/api/ai/settings',
];

export function middleware(request) {
  const path = request.nextUrl.pathname;
  const isAuthenticated = request.cookies.has('auth');

  const isProtectedApi = PROTECTED_API_PATHS.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  );
  if (isProtectedApi && !isAuthenticated) {
    return NextResponse.json(
      { success: false, error: 'Sesi berakhir. Silakan login kembali.' },
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
