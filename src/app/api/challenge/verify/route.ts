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

        // Verify the Turnstile CAPTCHA response
        const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
        if (!turnstileSecret) {
            console.error('[Challenge] Missing TURNSTILE_SECRET_KEY');
            return NextResponse.json(
                { error: 'Server configuration error' },
                { status: 500 }
            );
        }

        const verifyResponse = await fetch(
            'https://challenges.cloudflare.com/turnstile/v0/siteverify',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    secret: turnstileSecret,
                    response: challengeResponse,
                    remoteip: request.headers.get('x-real-ip') || undefined,
                }),
            }
        );

        const verifyData = await verifyResponse.json();

        if (!verifyData.success) {
            console.warn('[Challenge] Turnstile verification failed:', verifyData['error-codes']);
            return NextResponse.json(
                { error: 'Verification failed. Please try again.' },
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
