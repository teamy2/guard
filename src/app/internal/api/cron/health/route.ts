import { NextRequest, NextResponse } from 'next/server';
import { getActiveConfig } from '@/config/storage';
import { saveBackendHealth, getAllBackendHealth } from '@/config/storage';
import { setBackendHealth } from '@/edge/route-selector';
import * as Sentry from '@sentry/nextjs';
import { setBackendHealthGauge } from '@/sentry/instrumentation';

export const runtime = 'nodejs'; // Cron can run on Node.js

/**
 * Verify cron secret to prevent unauthorized access
 */
function verifyCronSecret(request: NextRequest): boolean {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
        return true; // Allow in dev if no secret configured
    }

    return authHeader === `Bearer ${cronSecret}`;
}

/**
 * Check health of a single backend
 */
async function checkBackendHealth(
    backendUrl: string,
    healthEndpoint: string
): Promise<{ healthy: boolean; latencyMs: number }> {
    const url = new URL(healthEndpoint, backendUrl);
    const startTime = Date.now();

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(url.toString(), {
            method: 'GET',
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const latencyMs = Date.now() - startTime;
        const healthy = response.ok;

        return { healthy, latencyMs };
    } catch {
        return { healthy: false, latencyMs: Date.now() - startTime };
    }
}

/**
 * Calculate percentiles from latency samples
 */
function calculatePercentiles(samples: number[]): {
    p50: number;
    p95: number;
    p99: number;
} {
    if (samples.length === 0) {
        return { p50: 0, p95: 0, p99: 0 };
    }

    const sorted = [...samples].sort((a, b) => a - b);

    return {
        p50: sorted[Math.floor(sorted.length * 0.5)] ?? 0,
        p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
        p99: sorted[Math.floor(sorted.length * 0.99)] ?? 0,
    };
}

export async function GET(request: NextRequest) {
    // Verify cron secret
    if (!verifyCronSecret(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Load current config
        const config = await getActiveConfig();

        // Get existing health data for failure counting
        const existingHealth = await getAllBackendHealth();
        const healthMap = new Map(existingHealth.map(h => [h.backendId, h]));

        // Check each backend
        const results = await Promise.all(
            config.backends.map(async (backend) => {
                // Take 3 samples for latency calculation
                const samples: number[] = [];
                let healthy = true;

                for (let i = 0; i < 3; i++) {
                    const result = await checkBackendHealth(backend.url, backend.healthEndpoint);
                    samples.push(result.latencyMs);
                    if (!result.healthy) {
                        healthy = false;
                    }
                }

                const percentiles = calculatePercentiles(samples);
                const existing = healthMap.get(backend.id);

                // Track consecutive failures
                const consecutiveFailures = healthy
                    ? 0
                    : (existing?.consecutiveFailures ?? 0) + 1;

                const healthData = {
                    backendId: backend.id,
                    healthy,
                    lastCheck: new Date().toISOString(),
                    latencyP50: percentiles.p50,
                    latencyP95: percentiles.p95,
                    latencyP99: percentiles.p99,
                    errorRate: healthy ? 0 : 1,
                    consecutiveFailures,
                };

                // Save to database
                await saveBackendHealth(healthData);

                // Update in-memory cache
                setBackendHealth(healthData);

                // Update Sentry gauge
                setBackendHealthGauge(backend.id, healthy);

                return healthData;
            })
        );

        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            backends: results,
        });
    } catch (error) {
        Sentry.captureException(error);
        console.error('[HealthCron] Error:', error);

        return NextResponse.json(
            { error: 'Health check failed' },
            { status: 500 }
        );
    }
}
