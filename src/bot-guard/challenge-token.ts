import * as jose from 'jose';

const ALGORITHM = 'HS256';
const TOKEN_VALIDITY_MS = 3600 * 1000; // 1 hour

/**
 * Challenge token payload
 */
interface ChallengePayload {
    /** Hashed IP that completed the challenge */
    ipHash: string;
    /** Original path being accessed */
    path: string;
    /** Timestamp when challenge was completed */
    completedAt: number;
    /** Expiration timestamp */
    exp: number;
}

/**
 * Issue a proof-of-human token after challenge completion
 */
export async function issueToken(
    ipHash: string,
    path: string,
    secret: string
): Promise<string> {
    const now = Date.now();
    const payload: ChallengePayload = {
        ipHash,
        path,
        completedAt: now,
        exp: Math.floor((now + TOKEN_VALIDITY_MS) / 1000),
    };

    const secretKey = new TextEncoder().encode(secret);

    const token = await new jose.SignJWT(payload as unknown as jose.JWTPayload)
        .setProtectedHeader({ alg: ALGORITHM })
        .setIssuedAt()
        .setExpirationTime(payload.exp)
        .sign(secretKey);

    return token;
}

/**
 * Validate a proof-of-human token
 */
export async function validateToken(
    token: string,
    ipHash: string,
    secret: string
): Promise<{ valid: boolean; reason?: string }> {
    try {
        const secretKey = new TextEncoder().encode(secret);

        const { payload } = await jose.jwtVerify(token, secretKey, {
            algorithms: [ALGORITHM],
        });

        const challengePayload = payload as unknown as ChallengePayload;

        // Verify IP hash matches
        if (challengePayload.ipHash !== ipHash) {
            return { valid: false, reason: 'IP mismatch' };
        }

        return { valid: true };
    } catch (error) {
        if (error instanceof jose.errors.JWTExpired) {
            return { valid: false, reason: 'Token expired' };
        }
        return { valid: false, reason: 'Invalid token' };
    }
}

/**
 * Extract token from request (cookie or header)
 */
export function extractToken(request: Request): string | null {
    // Check header first
    const headerToken = request.headers.get('X-Challenge-Token');
    if (headerToken) {
        return headerToken;
    }

    // Check cookie
    const cookieHeader = request.headers.get('cookie');
    if (cookieHeader) {
        const cookies = cookieHeader.split(';').map(c => c.trim());
        const tokenCookie = cookies.find(c => c.startsWith('_challenge_token='));
        if (tokenCookie) {
            return tokenCookie.split('=')[1];
        }
    }

    return null;
}

/**
 * Create Set-Cookie header for the challenge token
 */
export function createTokenCookie(token: string, secure: boolean = true): string {
    const maxAge = Math.floor(TOKEN_VALIDITY_MS / 1000);
    const parts = [
        `_challenge_token=${token}`,
        `Max-Age=${maxAge}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Strict',
    ];

    if (secure) {
        parts.push('Secure');
    }

    return parts.join('; ');
}
