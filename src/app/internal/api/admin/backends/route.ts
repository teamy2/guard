import { NextRequest, NextResponse } from 'next/server';
import { getAllBackendHealth } from '@/config/storage';
import * as Sentry from '@sentry/nextjs';

/**
 * GET - Get all backend health status
 */
export async function GET(request: NextRequest) {
    try {
        const health = await getAllBackendHealth();

        return NextResponse.json({
            backends: health,
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
