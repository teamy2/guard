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

        // Verify the hCaptcha response
        const hcaptchaSecret = process.env.HCAPTCHA_SECRET_KEY;
        if (!hcaptchaSecret) {
            console.error('[Challenge] Missing HCAPTCHA_SECRET_KEY');
            return NextResponse.json(
                { error: 'Server configuration error' },
                { status: 500 }
            );
        }

        // hCaptcha siteverify expects application/x-www-form-urlencoded or multipart/form-data
        const formData = new URLSearchParams();
        formData.append('secret', hcaptchaSecret);
        formData.append('response', challengeResponse);
        const remoteIP = request.headers.get('x-real-ip');
        if (remoteIP) {
            formData.append('remoteip', remoteIP);
        }

        const verifyResponse = await fetch(
            'https://hcaptcha.com/siteverify',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formData.toString(),
            }
        );

        const verifyData = await verifyResponse.json();

        if (!verifyData.success) {
            console.warn('[Challenge] hCaptcha verification failed:', verifyData['error-codes']);
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

        // Create redirect response
        const redirectUrl = returnPath || '/';
        let response: NextResponse;
        
        try {
            // Try to create absolute URL for redirect
            const baseUrl = new URL(request.url);
            const targetUrl = new URL(redirectUrl, baseUrl.origin);
            response = NextResponse.redirect(targetUrl);
        } catch {
            // Fallback to relative redirect
            response = NextResponse.redirect(new URL(redirectUrl, request.url));
        }

        // Set the cookie with proper attributes
        const isSecure = request.url.startsWith('https') || process.env.NODE_ENV === 'production';
        response.headers.set(
            'Set-Cookie',
            createTokenCookie(token, isSecure)
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
