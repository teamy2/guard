import { nanoid } from 'nanoid';
import type { RequestFeatures } from '@/config/schema';

/**
 * Hash an IP address with a rotating salt for privacy
 * Uses a simple but effective approach suitable for Edge runtime
 */
async function hashIP(ip: string, salt: string): Promise<string> {
    const data = new TextEncoder().encode(ip + salt);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    // Take first 16 chars for a reasonable fingerprint
    return hashArray.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Extract subnet from IP (IPv4 only for simplicity)
 */
function extractSubnet(ip: string, mask: number = 24): string {
    const parts = ip.split('.');
    if (parts.length !== 4) return ip; // Not IPv4

    const ipNum = parts.reduce((acc, part) => (acc << 8) + parseInt(part, 10), 0);
    const maskNum = (-1 << (32 - mask)) >>> 0;
    const subnetNum = (ipNum & maskNum) >>> 0;

    return [
        (subnetNum >>> 24) & 255,
        (subnetNum >>> 16) & 255,
        (subnetNum >>> 8) & 255,
        subnetNum & 255,
    ].join('.') + '/' + mask;
}

/**
 * Get client IP from various headers
 */
function getClientIP(request: Request): string {
    // Vercel-specific headers
    const vercelIP = request.headers.get('x-real-ip');
    if (vercelIP) return vercelIP;

    // Standard forwarded header
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) {
        const ips = forwarded.split(',').map(ip => ip.trim());
        return ips[0];
    }

    // Fallback
    return '0.0.0.0';
}

/**
 * Count cookies without exposing values
 */
function countCookies(request: Request): number {
    const cookieHeader = request.headers.get('cookie');
    if (!cookieHeader) return 0;
    return cookieHeader.split(';').filter(c => c.trim()).length;
}

/**
 * Extract a safe subset of headers for logging
 * Returns header names only (not values) plus count
 */
function getHeaderInfo(request: Request): { count: number; names: string[] } {
    const safeHeaders = [
        'accept',
        'accept-language',
        'accept-encoding',
        'cache-control',
        'connection',
        'content-type',
        'user-agent',
        'referer',
        'origin',
        'sec-fetch-dest',
        'sec-fetch-mode',
        'sec-fetch-site',
        'sec-ch-ua',
        'sec-ch-ua-mobile',
        'sec-ch-ua-platform',
    ];

    const presentHeaders = safeHeaders.filter(h => request.headers.has(h));

    // Count total headers (but don't expose sensitive ones)
    let totalCount = 0;
    request.headers.forEach(() => totalCount++);

    return { count: totalCount, names: presentHeaders };
}

/**
 * Extract session ID from cookie if present
 */
function getSessionId(request: Request): string | undefined {
    const cookieHeader = request.headers.get('cookie');
    if (!cookieHeader) return undefined;

    const sessionCookie = cookieHeader.split(';')
        .map(c => c.trim())
        .find(c => c.startsWith('session=') || c.startsWith('sid=') || c.startsWith('_session='));

    if (sessionCookie) {
        return sessionCookie.split('=')[1];
    }

    return undefined;
}

/**
 * Extract all features from an incoming request
 * This is the main entry point for feature extraction
 */
export async function extractFeatures(
    request: Request,
    ipSalt: string
): Promise<RequestFeatures> {
    const url = new URL(request.url);
    const clientIP = getClientIP(request);
    const headerInfo = getHeaderInfo(request);

    // Generate unique IDs for this request
    const requestId = nanoid(16);
    const traceId = request.headers.get('x-trace-id') || nanoid(32);

    // Hash IP for privacy
    const ipHash = await hashIP(clientIP, ipSalt);

    // Extract geo info from Vercel headers
    const geo = {
        country: request.headers.get('x-vercel-ip-country') || undefined,
        region: request.headers.get('x-vercel-ip-country-region') || undefined,
        city: request.headers.get('x-vercel-ip-city') || undefined,
    };

    return {
        requestId,
        traceId,

        // Network (privacy-safe)
        ipHash,
        subnet: extractSubnet(clientIP),

        // Geo
        country: geo.country,
        region: geo.region,
        city: geo.city,
        asn: request.headers.get('x-vercel-ip-asn') || undefined,

        // Request
        method: request.method,
        path: url.pathname,
        host: url.host,
        protocol: url.protocol.replace(':', ''),

        // Headers (sanitized)
        userAgent: request.headers.get('user-agent') || '',
        acceptLanguage: request.headers.get('accept-language') || undefined,
        acceptEncoding: request.headers.get('accept-encoding') || undefined,
        referer: request.headers.get('referer') || undefined,
        origin: request.headers.get('origin') || undefined,

        // Computed
        headerCount: headerInfo.count,
        hasAcceptHeader: request.headers.has('accept'),
        hasCookies: request.headers.has('cookie'),
        cookieCount: countCookies(request),

        // TLS (from Vercel)
        tlsVersion: request.headers.get('x-vercel-tls-version') || undefined,

        // Session
        sessionId: getSessionId(request),

        // Timestamp
        timestamp: Date.now(),
    };
}

/**
 * Create a minimal feature summary for AI classifier
 * No PII, just behavioral signals
 */
export function createAIFeatureSummary(features: RequestFeatures): Record<string, unknown> {
    return {
        method: features.method,
        pathLength: features.path.length,
        pathDepth: features.path.split('/').filter(Boolean).length,
        hasQueryParams: features.path.includes('?'),

        headerCount: features.headerCount,
        hasAcceptHeader: features.hasAcceptHeader,
        hasCookies: features.hasCookies,
        cookieCount: features.cookieCount,

        userAgentLength: features.userAgent.length,
        hasAcceptLanguage: !!features.acceptLanguage,
        hasReferer: !!features.referer,
        hasOrigin: !!features.origin,

        country: features.country,
        hour: new Date(features.timestamp).getUTCHours(),
        dayOfWeek: new Date(features.timestamp).getUTCDay(),
    };
}
