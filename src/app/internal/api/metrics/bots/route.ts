import { NextRequest, NextResponse } from 'next/server';
import { getBotStats } from '@/config/storage';
import { getActiveConfig } from '@/config/storage';
import * as Sentry from '@sentry/nextjs';

export const runtime = 'nodejs'; // Must be Node.js for Postgres

/**
 * GET - Get bot detection statistics
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const hours = parseInt(searchParams.get('hours') || '1', 10);

    const [botStats, config] = await Promise.all([
      getBotStats(hours),
      getActiveConfig(),
    ]);

    // Get bot guard configuration
    const botConfig = config.defaultBotGuard;

    return NextResponse.json({
      ...botStats,
      config: {
        heuristics: botConfig.enabled,
        aiClassifier: botConfig.useAiClassifier,
        challengeMode: botConfig.enabled && botConfig.actions.medium === 'challenge',
        thresholds: botConfig.thresholds,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    Sentry.captureException(error);
    console.error('[Metrics] Error fetching bot stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bot stats' },
      { status: 500 }
    );
  }
}
