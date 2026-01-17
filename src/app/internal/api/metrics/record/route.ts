import { NextRequest, NextResponse } from 'next/server';
import { recordRequestMetric } from '@/config/storage';
import type { RequestMetric } from '@/config/storage';
import * as Sentry from '@sentry/nextjs';

export const runtime = 'nodejs'; // Must be Node.js for Postgres

/**
 * POST - Record a request metric
 * Called from edge runtime after processing requests
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as RequestMetric;

    // Validate required fields
    if (!body.requestId || !body.decision) {
      return NextResponse.json(
        { error: 'Missing required fields: requestId, decision' },
        { status: 400 }
      );
    }

    // Record metric (async, don't wait)
    recordRequestMetric(body).catch((error) => {
      console.error('[Metrics] Failed to record:', error);
      Sentry.captureException(error);
    });

    // Return immediately to avoid blocking
    return NextResponse.json({ success: true }, { status: 202 });
  } catch (error) {
    Sentry.captureException(error);
    console.error('[Metrics] Error recording metric:', error);
    return NextResponse.json(
      { error: 'Failed to record metric' },
      { status: 500 }
    );
  }
}
