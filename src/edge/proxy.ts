import type { Backend } from '@/config/schema';

/**
 * Proxy request to selected backend
 */
export async function proxyRequest(
    request: Request,
    backend: Backend,
    additionalHeaders: Record<string, string> = {}
): Promise<Response> {
    console.log('[Proxy] request url:', request.url);
    const url = new URL(request.url);
    console.log('[Proxy] backend url:', backend.url);
    const backendUrl = new URL(backend.url);

    // Rewrite URL to backend
    url.protocol = backendUrl.protocol;
    url.host = backendUrl.host;
    url.port = backendUrl.port;

    // Create new headers, preserving most original headers
    const headers = new Headers(request.headers);


    // Add any additional headers (request ID, trace ID, etc.)
    for (const [key, value] of Object.entries(additionalHeaders)) {
        headers.set(key, value);
    }

    // Don't forward host header - use backend host
    headers.set('Host', backendUrl.host);

    const startTime = Date.now();

    try {
        const response = await fetch(url.toString(), {
            method: request.method,
            headers,
            body: request.body,
        });

        // Copy all response headers exactly as-is to preserve compression
        const responseHeaders = new Headers();
        for (const [key, value] of response.headers.entries()) {
            responseHeaders.set(key, value);
        }

        // Vercel Edge Runtime's fetch() may automatically decompress gzip/brotli responses
        // while keeping the Content-Encoding header, causing a mismatch.
        // 
        // The WHATWG Fetch Standard says fetch() should transparently decompress
        // and remove Content-Encoding, but Vercel's implementation might keep the header.
        // 
        // Solution: If Content-Encoding is present but Vercel decompressed the body,
        // we need to remove the header. However, we can't easily detect decompression
        // without reading the body (which we don't want to do).
        //
        // Workaround: Remove Content-Encoding header if present, as Vercel's fetch()
        // likely already decompressed the body. The client will receive uncompressed
        // content, which is fine - Vercel's CDN will recompress it if needed.
        const contentEncoding = responseHeaders.get('content-encoding');
        if (contentEncoding && (contentEncoding.includes('gzip') || contentEncoding.includes('br') || contentEncoding.includes('deflate'))) {
            // Vercel's fetch() likely decompressed this, so remove the header
            // to prevent client-side decompression errors
            responseHeaders.delete('content-encoding');
            // Also remove Content-Length as it won't match after decompression
            responseHeaders.delete('content-length');
        }
        
        // Pass through body stream exactly as-is
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders,
        });
    } catch (error) {
        const latency = Date.now() - startTime;

        // Return a 502 Bad Gateway on backend error
        return new Response(
            JSON.stringify({
                error: 'Bad Gateway',
                message: 'Backend unavailable',
                backend: backend.id,
            }),
            {
                status: 502,
                headers: {
                    'Content-Type': 'application/json',
                    'X-Backend': backend.id,
                    'X-Backend-Latency': String(latency),
                },
            }
        );
    }
}

/**
 * Create a block response (403)
 */
export function createBlockResponse(
    requestId: string,
    minimal: boolean = true
): Response {
    const body = minimal
        ? 'Forbidden'
        : JSON.stringify({ error: 'Forbidden', requestId });

    return new Response(body, {
        status: 403,
        headers: {
            'Content-Type': minimal ? 'text/plain' : 'application/json',
            'X-Request-Id': requestId,
        },
    });
}

/**
 * Create a throttle response (429)
 */
export function createThrottleResponse(
    requestId: string,
    retryAfterSeconds: number = 60,
    remaining: number = 0,
    resetAt: number = Date.now() + 60000
): Response {
    return new Response(
        JSON.stringify({
            error: 'Too Many Requests',
            message: 'Rate limit exceeded',
            retryAfter: retryAfterSeconds,
        }),
        {
            status: 429,
            headers: {
                'Content-Type': 'application/json',
                'X-Request-Id': requestId,
                'Retry-After': String(retryAfterSeconds),
                'X-RateLimit-Remaining': String(remaining),
                'X-RateLimit-Reset': String(Math.ceil(resetAt / 1000)),
            },
        }
    );
}

/**
 * Create a challenge redirect response
 */
export function createChallengeResponse(
    requestId: string,
    challengeUrl: string,
    originalUrl: string
): Response {
    const redirectUrl = `${challengeUrl}?return=${encodeURIComponent(originalUrl)}`;

    return new Response(null, {
        status: 302,
        headers: {
            'Location': redirectUrl,
            'X-Request-Id': requestId,
        },
    });
}

/**
 * Create response headers with standard fields
 */
export function createStandardHeaders(
    requestId: string,
    traceId: string,
    additionalHeaders: Record<string, string> = {}
): Record<string, string> {
    return {
        'X-Request-Id': requestId,
        'X-Trace-Id': traceId,
        ...additionalHeaders,
    };
}
