import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { handleRequest, shouldExcludePath } from '@/edge/balancer';
import { loadConfig } from '@/config';
import { neonAuthMiddleware } from "@neondatabase/auth/next/server";

export const runtime = 'edge';

async function balancerMiddleware(request: NextRequest) {
    console.log('[Middleware] request.url:', request.url);
    const path = new URL(request.url).pathname;

    // Skip excluded paths
    if (shouldExcludePath(path)) {
        return NextResponse.next();
    }

    try {
        // Load configuration (cached in KV)
        const config = await loadConfig();

        // If no backends configured, pass through
        if (config.backends.length === 0) {
            console.log('[Middleware] No backends configured (or fallback used), passing through');
            return NextResponse.next();
        }

        // Process through load balancer
        const response = await handleRequest(request, config);

        return response;
    } catch (error) {
        // Capture error and fail open
        Sentry.captureException(error);
        console.error('[Middleware] Error:', error);
        await Sentry.flush(2000);

        return NextResponse.next();
    }
}

const authMiddleware = neonAuthMiddleware({
    loginUrl: "/internal/auth/sign-in",
});

export async function middleware(request: NextRequest, event: any) {
    // Run auth middleware first
    // Note: neonAuthMiddleware returns a NextMiddleware which takes request and event
    const authRes = await authMiddleware(request);

    // If auth middleware returned a response (redirect or something), return it
    if (authRes && authRes.status !== 200) {
        // If it's a redirect to the login page, append the current URL as redirectTo
        if ((authRes.status === 307 || authRes.status === 302) && authRes.headers.get('Location')?.includes('/sign-in')) {
            const location = authRes.headers.get('Location');
            const url = new URL(location!, request.url);
            url.searchParams.set('redirectTo', request.url);

            return NextResponse.redirect(url);
        }
        return authRes;
    }

    // Otherwise, continue to balancer logic
    return balancerMiddleware(request);
}

// Configure which paths the middleware runs on
export const config = {
    matcher: [
        /*
         * Match all request paths except:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - public folder
         * - api/auth (auth routes)
         * - api/cron (cron jobs)
         * - api/health (internal health check)
         * - internal (all internal routes including admin, API, cron, health)
         * - challenge (challenge page)
         * - images/files
         */
        '/((?!_next/static|_next/image|favicon.ico|internal|sentry-example-page|challenge|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
};
