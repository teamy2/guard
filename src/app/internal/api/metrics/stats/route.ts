import { NextRequest, NextResponse } from 'next/server';
import { getDashboardStats, getBotStats } from '@/config/storage';
import * as Sentry from '@sentry/nextjs';

export const runtime = 'nodejs'; // Must be Node.js for Postgres

/**
 * GET - Get aggregated dashboard statistics
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const hours = parseInt(searchParams.get('hours') || '1', 10);
    const domain = searchParams.get('domain') || undefined;

    const [dashboardStats, botStats] = await Promise.all([
      getDashboardStats(hours, domain),
      getBotStats(hours, domain),
    ]);

    return NextResponse.json({
      ...dashboardStats,
      botStats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    Sentry.captureException(error);
    console.error('[Metrics] Error fetching stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}
