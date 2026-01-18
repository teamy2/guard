import { NextRequest } from 'next/server';
import { createAuthServer } from '@neondatabase/auth/next/server';

export const authServer = createAuthServer();

/**
 * Get current user ID from request using Neon Auth server API
 */
export async function getCurrentUserId(request: NextRequest): Promise<string | null> {
    try {
        // The auth client should be able to get user from request cookies
        const { data } = await authServer.getSession();
        return data?.user?.id || null;
    } catch (error) {
        console.error('[Auth] Failed to get user ID:', error);
        return null;
    }
}
