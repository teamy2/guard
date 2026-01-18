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
    const domainParam = searchParams.get('domain');
    // Normalize domain (lowercase, trim) for consistent querying
    const domain = domainParam ? domainParam.toLowerCase().trim() : undefined;

    console.log('[Traffic API] Querying traffic data for domain:', domain);
    const data = await getTimeBucketedRequests(domain);
    console.log('[Traffic API] Found', data.length, 'data points');

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
