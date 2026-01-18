import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { getTimeBucketedRequests } from '@/config/storage';

// Must be Node.js for Postgres

/**
 * GET - Get time-bucketed traffic data for the last 24 hours
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const domain = searchParams.get('domain') || undefined;

    const data = await getTimeBucketedRequests(domain);

    return NextResponse.json({
      data,
      count: data.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    Sentry.captureException(error);
    console.error('[Metrics] Error fetching time-bucketed traffic:', error);
    return NextResponse.json(
      { error: 'Failed to fetch traffic data' },
      { status: 500 }
    );
  }
}
