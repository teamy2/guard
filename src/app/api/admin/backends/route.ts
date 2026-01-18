import { NextRequest, NextResponse } from 'next/server';
import { getAllBackendHealth } from '@/config/storage';
import { sql } from '@vercel/postgres';
import * as Sentry from '@sentry/nextjs';

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

/**
 * GET - Get all backend health status with real latency metrics
 */
export async function GET(request: NextRequest) {
    try {
        const health = await getAllBackendHealth();
        const searchParams = request.nextUrl.searchParams;
        const hours = parseInt(searchParams.get('hours') || '1', 10);
        const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

        // Get real latency data from request metrics for the last hour
        const latencyData = await sql`
            SELECT 
                backend_id,
                latency_ms,
                status_code
            FROM request_metrics
            WHERE timestamp >= ${since}
                AND backend_id IS NOT NULL
                AND latency_ms IS NOT NULL
                AND latency_ms > 0
            ORDER BY backend_id, latency_ms
        `;

        // Group latencies by backend and calculate percentiles
        const latenciesByBackend = new Map<string, number[]>();
        const errorsByBackend = new Map<string, number>();

        for (const row of latencyData.rows) {
            const backendId = row.backend_id as string;
            const latency = row.latency_ms as number;
            const statusCode = row.status_code as number;

            if (!latenciesByBackend.has(backendId)) {
                latenciesByBackend.set(backendId, []);
                errorsByBackend.set(backendId, 0);
            }

            latenciesByBackend.get(backendId)!.push(latency);

            // Count errors (5xx status codes)
            if (statusCode >= 500) {
                errorsByBackend.set(backendId, (errorsByBackend.get(backendId) || 0) + 1);
            }
        }

        // Merge health check data with real request latency data
        const backends = health.map(backend => {
            const requestLatencies = latenciesByBackend.get(backend.backendId) || [];
            const errorCount = errorsByBackend.get(backend.backendId) || 0;
            const totalRequests = requestLatencies.length;

            // Use real request latencies if available, otherwise fall back to health check data
            const percentiles = requestLatencies.length > 0
                ? calculatePercentiles(requestLatencies)
                : {
                    p50: backend.latencyP50 || 0,
                    p95: backend.latencyP95 || 0,
                    p99: backend.latencyP99 || 0,
                };

            // Calculate error rate from actual requests
            const errorRate = totalRequests > 0 ? errorCount / totalRequests : (backend.errorRate || 0);

            return {
                ...backend,
                latencyP50: percentiles.p50,
                latencyP95: percentiles.p95,
                latencyP99: percentiles.p99,
                errorRate: errorRate,
            };
        });

        return NextResponse.json({
            backends,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        Sentry.captureException(error);
        return NextResponse.json(
            { error: 'Failed to fetch backend health' },
            { status: 500 }
        );
    }
}
