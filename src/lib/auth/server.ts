import { NextRequest } from 'next/server';
import { createAuthClient } from '@neondatabase/auth/next/server';

/**
 * Get current user ID from request using Neon Auth server API
 */
export async function getCurrentUserId(request: NextRequest): Promise<string | null> {
    try {
        const authClient = createAuthClient();
        // The auth client should be able to get user from request cookies
        const user = await authClient.getUser({ request });
        return user?.id || null;
    } catch (error) {
        console.error('[Auth] Failed to get user ID:', error);
        return null;
    }
}
