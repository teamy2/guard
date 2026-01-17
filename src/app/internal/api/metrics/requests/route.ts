import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { getRecentRequests } from '@/config/storage';

// Must be Node.js for Postgres

/**
 * GET - Get recent requests for traffic overview
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const requests = await getRecentRequests(limit);

    return NextResponse.json({
      requests,
      count: requests.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    Sentry.captureException(error);
    console.error('[Metrics] Error fetching recent requests:', error);
    return NextResponse.json(
      { error: 'Failed to fetch recent requests' },
      { status: 500 }
    );
  }
}
