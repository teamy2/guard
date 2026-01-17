import { NextRequest, NextResponse } from 'next/server';
import { getAllBackendHealth } from '@/config/storage';
import * as Sentry from '@sentry/nextjs';

/**
 * Verify admin API key
 */
function verifyAdminAuth(request: NextRequest): boolean {
    const authHeader = request.headers.get('authorization');
    const apiKey = process.env.ADMIN_API_KEY;

    if (!apiKey) {
        return process.env.NODE_ENV === 'development';
    }

    return authHeader === `Bearer ${apiKey}`;
}

/**
 * GET - Get all backend health status
 */
export async function GET(request: NextRequest) {
    if (!verifyAdminAuth(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
