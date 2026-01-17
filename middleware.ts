import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { handleRequest, shouldExcludePath } from '@/edge/balancer';
import { loadConfig } from '@/config';

export const runtime = 'edge';

export async function middleware(request: NextRequest) {
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
            return NextResponse.next();
        }

        // Process through load balancer
        const response = await handleRequest(request, config);

        return response;
    } catch (error) {
        // Capture error and fail open
        Sentry.captureException(error);
        console.error('[Middleware] Error:', error);

        return NextResponse.next();
    }
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
         * - internal (admin routes)
         * - api/auth (auth routes)
         * - api/cron (cron jobs)
         * - api/health (internal health check)
         * - challenge (challenge page)
         */
        '/((?!_next/static|_next/image|favicon.ico|internal|sentry-example-page|api/auth|api/cron|api/health|challenge|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
};
