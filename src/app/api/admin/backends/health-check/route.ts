import { NextRequest, NextResponse } from 'next/server';
import { getActiveConfig } from '@/config/storage';
import * as Sentry from '@sentry/nextjs';

/**
 * Check health of a single backend and return latency
 */
async function checkBackendHealth(
    backendUrl: string,
    healthEndpoint: string,
    timeoutMs: number = 5000
): Promise<{ healthy: boolean; latencyMs: number | null; timedOut: boolean }> {
    const url = new URL(healthEndpoint, backendUrl);
    const startTime = Date.now();

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const response = await fetch(url.toString(), {
            method: 'GET',
            signal: controller.signal,
            // Don't follow redirects
            redirect: 'manual',
        });

        clearTimeout(timeoutId);

        const latencyMs = Date.now() - startTime;
        // Consider it healthy if we got a response (status code doesn't matter per user's request)
        const healthy = !controller.signal.aborted;

        return { healthy, latencyMs, timedOut: false };
    } catch (error) {
        const latencyMs = Date.now() - startTime;
        const timedOut = error instanceof Error && error.name === 'AbortError';
        
        return { 
            healthy: false, 
            latencyMs: timedOut ? null : latencyMs,
            timedOut 
        };
    }
}

/**
 * GET - Check health of all backends for a domain
 * This endpoint pings each backend and returns real-time latency
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const domain = searchParams.get('domain') || 'default';

        // Load active config for the domain
        const config = await getActiveConfig(domain);

        // Check each backend
        const results = await Promise.all(
            config.backends
                .filter(backend => backend.enabled) // Only check enabled backends
                .map(async (backend) => {
                    const result = await checkBackendHealth(
                        backend.url,
                        backend.healthEndpoint
                    );

                    return {
                        backendId: backend.id,
                        healthy: result.healthy && !result.timedOut,
                        latencyMs: result.latencyMs,
                        timedOut: result.timedOut,
                    };
                })
        );

        return NextResponse.json({
            backends: results,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        Sentry.captureException(error);
        console.error('[HealthCheck] Error:', error);

        return NextResponse.json(
            { error: 'Health check failed' },
            { status: 500 }
        );
    }
}
