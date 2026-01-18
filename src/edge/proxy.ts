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

    const startTime = Date.now();

    try {
        const response = await fetch(url.toString(), {
            method: request.method,
            headers,
            body: request.body,
        });

        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
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
    originalPath: string
): Response {
    const redirectUrl = `${challengeUrl}?return=${encodeURIComponent(originalPath)}`;

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
