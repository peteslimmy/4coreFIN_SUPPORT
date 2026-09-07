import { NextRequest, NextResponse } from 'next/server';
import { csrfErrorResponse } from './lib/server/session';

/**
 * Edge middleware:
 * 1. CSRF enforcement for state-changing /api requests (double-submit +
 *    same-origin) — cookie/header only, no DB access.
 * 2. Auth presence gate for /app/* — redirects to the login screen when no
 *    session cookie exists. Full JWT + DB verification happens in route
 *    handlers / RSC via getSessionUser().
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith('/api')) {
    const failure = csrfErrorResponse(req);
    if (failure) return failure;
  }

  if (pathname.startsWith('/app')) {
    const hasSession = req.cookies.has('4c_csrf');
    if (!hasSession) {
      const url = req.nextUrl.clone();
      url.pathname = '/auth/login';
      url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*', '/app/:path*'],
};
