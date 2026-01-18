import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { handleRequest } from '@/edge/balancer';
import { loadConfig } from '@/config';
import { neonAuthMiddleware } from "@neondatabase/auth/next/server";

async function balancerMiddleware(request: NextRequest) {
    console.log('[Middleware] request.url:', request.url);
    const path = new URL(request.url).pathname;

    try {
        // Load configuration (cached in KV)
        // Extract hostname to support multi-tenant configs
        const hostname = request.headers.get('host') || 'localhost';
        // Remove port number if present (e.g. localhost:3000 -> localhost)
        // Normalize domain (lowercase, trim) for consistent storage and querying
        const domain = hostname.split(':')[0].toLowerCase().trim();

        console.log('[Middleware] Extracted domain:', domain);
        const config = await loadConfig(domain);

        // If no backends configured, pass through
        if (config.backends.length === 0) {
            console.log('[Middleware] No backends configured (or fallback used), passing through');
            return NextResponse.next();
        }

        // Process through load balancer
        const response = await handleRequest(request, config, domain);

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
    loginUrl: "/auth/sign-in",
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

export async function proxy(request: NextRequest) {
    Sentry.logger.info('Proxy request received', { url: request.url, host: request.headers.get('host') });

    const path = new URL(request.url).pathname;

    if (request.headers.get('host') !== 'uottahack8.vercel.app') {
        return balancerMiddleware(request);
    }

    if (path.endsWith('/challenge') || path.startsWith('/api/challenge/')) {
        return NextResponse.next();
    }

    // Exclude /api/auth/ from load balancing (pass through directly)
    if (path.startsWith('/api/auth/')) {
        return NextResponse.next();
    }

    // Allow metrics endpoint to bypass auth if valid API key is provided
    if (path === '/api/metrics/record' && verifyMetricsAuth(request)) {
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

// Configure which paths the middleware runs on
export const config = {
    matcher: [
        '/((?!_next/static|_next/image).*)',
    ],
};
