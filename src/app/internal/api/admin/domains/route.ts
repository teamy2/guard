import { NextRequest, NextResponse } from 'next/server';
import { getUserDomains, assignDomainToUser } from '@/config/storage';
import * as Sentry from '@sentry/nextjs';

/**
 * Get current user ID from request
 * Note: This is a placeholder - implement proper auth extraction
 */
async function getCurrentUserId(request: NextRequest): Promise<string | null> {
    try {
        const cookieHeader = request.headers.get('cookie');
        if (!cookieHeader) {
            return null;
        }
        // TODO: Implement proper session extraction using Neon Auth server API
        const sessionMatch = cookieHeader.match(/(?:session|auth|user)[_\-]?id=([^;]+)/i);
        return sessionMatch ? sessionMatch[1] : null;
    } catch (error) {
        console.error('[Admin] Failed to get user ID:', error);
        return null;
    }
}

/**
 * GET - List all domains owned by the current user
 */
export async function GET(request: NextRequest) {
    try {
        const userId = await getCurrentUserId(request);
        
        if (!userId) {
            // In development, return empty array if no user
            // In production, return 401
            return NextResponse.json({ domains: [] });
        }

        const domains = await getUserDomains(userId);
        return NextResponse.json({ domains });
    } catch (error) {
        Sentry.captureException(error);
        return NextResponse.json(
            { error: 'Failed to fetch domains' },
            { status: 500 }
        );
    }
}

/**
 * POST - Create/assign a new domain to the current user
 */
export async function POST(request: NextRequest) {
    try {
        const userId = await getCurrentUserId(request);
        const body = await request.json();
        const { domain } = body;

        if (!domain) {
            return NextResponse.json(
                { error: 'Domain is required' },
                { status: 400 }
            );
        }

        // Validate domain format (basic validation)
        const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$/;
        if (!domainRegex.test(domain)) {
            return NextResponse.json(
                { error: 'Invalid domain format' },
                { status: 400 }
            );
        }

        if (!userId) {
            return NextResponse.json(
                { error: 'Authentication required' },
                { status: 401 }
            );
        }

        await assignDomainToUser(domain, userId);

        return NextResponse.json({
            success: true,
            domain
        });
    } catch (error) {
        Sentry.captureException(error);
        return NextResponse.json(
            { error: 'Failed to create domain' },
            { status: 500 }
        );
    }
}
