import { NextResponse } from 'next/server';

/**
 * Health check endpoint for the load balancer itself
 */
export async function GET() {
    return NextResponse.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.VERCEL_GIT_COMMIT_SHA || 'local',
    });
}
