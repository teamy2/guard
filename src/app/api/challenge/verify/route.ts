import { NextRequest, NextResponse } from 'next/server';
import { issueToken, createTokenCookie } from '@/bot-guard/challenge-token';
import { extractFeatures } from '@/edge/feature-extractor';

/**
 * POST - Verify challenge and issue token
 * This is a simplified challenge - in production you'd integrate
 * with a CAPTCHA service like hCaptcha or Turnstile
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { challengeResponse, returnPath } = body;

        // In a real implementation, verify the CAPTCHA response here
        // For demo purposes, we accept any non-empty response
        if (!challengeResponse) {
            return NextResponse.json(
                { error: 'Challenge response required' },
                { status: 400 }
            );
        }

        // Extract features to get hashed IP
        const ipSalt = process.env.IP_HASH_SALT || 'default-salt';
        const features = await extractFeatures(request, ipSalt);

        // Issue proof-of-human token
        const challengeSecret = process.env.CHALLENGE_SECRET || 'default-secret';
        const token = await issueToken(features.ipHash, returnPath || '/', challengeSecret);

        // Create response with cookie
        const response = NextResponse.json({
            success: true,
            returnPath: returnPath || '/',
        });

        response.headers.append(
            'Set-Cookie',
            createTokenCookie(token, request.url.startsWith('https'))
        );

        return response;
    } catch (error) {
        console.error('[Challenge] Error:', error);
        return NextResponse.json(
            { error: 'Challenge verification failed' },
            { status: 500 }
        );
    }
}
