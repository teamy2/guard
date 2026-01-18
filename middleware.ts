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
        // Extract hostname to support multi-tenant configs
        const hostname = request.headers.get('host') || 'localhost';
        // Remove port number if present (e.g. localhost:3000 -> localhost)
        const domain = hostname.split(':')[0];

        const config = await loadConfig(domain);

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

/**
 * Verify metrics API key
 */
function verifyMetricsAuth(request: NextRequest): boolean {
    const authHeader = request.headers.get('authorization');
    const apiKey = process.env.METRICS_API_KEY;

    if (!apiKey) {
        return false;
    }

    return authHeader === `Bearer ${apiKey}`;
}

export async function middleware(request: NextRequest, event: any) {
    const path = new URL(request.url).pathname;

    // Exclude /api/auth/ from load balancing (pass through directly)
    if (path.startsWith('/api/auth/')) {
        return NextResponse.next();
    }

    // Only run auth middleware for /internal/ paths
    if (path.startsWith('/internal/')) {
        // Allow challenge-related APIs to bypass auth (users need to access these without being logged in)
        if (path.startsWith('/internal/api/challenge/')) {
            return NextResponse.next();
        }

        // Allow metrics endpoint to bypass auth if valid API key is provided
        if (path === '/internal/api/metrics/record' && verifyMetricsAuth(request)) {
            return NextResponse.next();
        }

        // Run auth middleware
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

        // Auth passed, let the request continue to the route handler
        return NextResponse.next();
    }

    // For non-internal paths, run balancer logic
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
         * - sentry-example-page
         * - challenge (challenge page)
         * 
         * Note: Public folder files (served at root) are now intercepted by middleware.
         * We include /internal/ paths so auth middleware can run on them,
         * but exclude them from balancer processing in shouldExcludePath()
         */
        '/((?!_next/static|_next/image|favicon.ico|sentry-example-page|challenge).*)',
    ],
};
