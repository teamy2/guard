import { NextRequest, NextResponse } from 'next/server';
import {
    getActiveConfig,
    saveConfig,
    activateConfig,
    listConfigs,
    deleteConfig,
    userOwnsDomain,
    assignDomainToUser,
    getUserDomains
} from '@/config/storage';
import { invalidateConfigCache } from '@/config/loader';
import { GlobalConfigSchema } from '@/config/schema';
import * as Sentry from '@sentry/nextjs';

/**
 * Get current user ID from request
 * Note: This requires Neon auth to be properly configured
 * In development, this may return null if auth is not set up
 */
async function getCurrentUserId(request: NextRequest): Promise<string | null> {
    try {
        // Try to get user from cookies/session
        // Neon Auth stores session info in cookies
        const cookieHeader = request.headers.get('cookie');
        if (!cookieHeader) {
            return null;
        }

        // For now, we'll extract user ID from a session cookie if available
        // In production, you should use the proper Neon Auth server API
        // This is a placeholder that allows the system to work
        // TODO: Implement proper session extraction using Neon Auth server API
        
        // Check for common session cookie patterns
        const sessionMatch = cookieHeader.match(/(?:session|auth|user)[_\-]?id=([^;]+)/i);
        if (sessionMatch) {
            return sessionMatch[1];
        }

        // If no session found, return null (allows unauthenticated access in dev)
        // In production, you should enforce authentication
        return null;
    } catch (error) {
        console.error('[Admin] Failed to get user ID:', error);
        return null;
    }
}

/**
 * GET - List all configs or get active config
 */
export async function GET(request: NextRequest) {
    try {
        const userId = await getCurrentUserId(request);
        const { searchParams } = new URL(request.url);
        const listAll = searchParams.get('list') === 'true';
        const domain = searchParams.get('domain') || undefined;

        if (listAll) {
            // If user is logged in, only show their domains
            if (userId) {
                const userDomains = await getUserDomains(userId);
                // Filter configs to only show user's domains
                const allConfigs = await listConfigs();
                const filteredConfigs = allConfigs.filter(c => 
                    userDomains.includes(c.domain) || c.domain === 'default'
                );
                return NextResponse.json({ configs: filteredConfigs, domains: userDomains });
            }
            // If no user, show all (for admin/development)
            const configs = await listConfigs(domain);
            return NextResponse.json({ configs });
        }

        // Get active config for domain
        const configDomain = domain || 'default';
        
        // Check ownership if user is logged in
        if (userId && configDomain !== 'default') {
            const owns = await userOwnsDomain(configDomain, userId);
            if (!owns) {
                return NextResponse.json(
                    { error: 'You do not have access to this domain' },
                    { status: 403 }
                );
            }
        }

        const config = await getActiveConfig(configDomain);
        return NextResponse.json({ config });
    } catch (error) {
        Sentry.captureException(error);
        return NextResponse.json(
            { error: 'Failed to fetch config' },
            { status: 500 }
        );
    }
}

/**
 * POST - Create or update config
 */
export async function POST(request: NextRequest) {
    try {
        const userId = await getCurrentUserId(request);
        const body = await request.json();

        // Validate config
        const parsed = GlobalConfigSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid config', details: parsed.error.issues },
                { status: 400 }
            );
        }

        const domain = parsed.data.domain || 'default';

        // Check ownership if user is logged in and domain is not default
        if (userId && domain !== 'default') {
            const owns = await userOwnsDomain(domain, userId);
            if (!owns) {
                // Auto-assign ownership on first config creation
                await assignDomainToUser(domain, userId);
            }
        }

        await saveConfig(parsed.data);

        // Invalidate cache if active
        if (parsed.data.status === 'active') {
            await invalidateConfigCache(domain);
        }

        return NextResponse.json({
            success: true,
            version: parsed.data.version
        });
    } catch (error) {
        Sentry.captureException(error);
        return NextResponse.json(
            { error: 'Failed to save config' },
            { status: 500 }
        );
    }
}

/**
 * PUT - Activate a draft config
 */
export async function PUT(request: NextRequest) {
    try {
        const userId = await getCurrentUserId(request);
        const body = await request.json();
        const { version, domain } = body;

        if (!version) {
            return NextResponse.json(
                { error: 'Version required' },
                { status: 400 }
            );
        }

        const configDomain = domain || 'default';

        // Check ownership if user is logged in
        if (userId && configDomain !== 'default') {
            const owns = await userOwnsDomain(configDomain, userId);
            if (!owns) {
                return NextResponse.json(
                    { error: 'You do not have access to this domain' },
                    { status: 403 }
                );
            }
        }

        await activateConfig(version, configDomain);
        await invalidateConfigCache(configDomain);

        return NextResponse.json({
            success: true,
            activated: version
        });
    } catch (error) {
        Sentry.captureException(error);
        return NextResponse.json(
            { error: 'Failed to activate config' },
            { status: 500 }
        );
    }
}

/**
 * DELETE - Delete a draft config
 */
export async function DELETE(request: NextRequest) {
    try {
        const userId = await getCurrentUserId(request);
        const { searchParams } = new URL(request.url);
        const version = searchParams.get('version');
        const domain = searchParams.get('domain') || 'default';

        if (!version) {
            return NextResponse.json(
                { error: 'Version required' },
                { status: 400 }
            );
        }

        // Check ownership if user is logged in
        if (userId && domain !== 'default') {
            const owns = await userOwnsDomain(domain, userId);
            if (!owns) {
                return NextResponse.json(
                    { error: 'You do not have access to this domain' },
                    { status: 403 }
                );
            }
        }

        const deleted = await deleteConfig(version, domain);

        if (!deleted) {
            return NextResponse.json(
                { error: 'Config not found or is active' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            deleted: version
        });
    } catch (error) {
        Sentry.captureException(error);
        return NextResponse.json(
            { error: 'Failed to delete config' },
            { status: 500 }
        );
    }
}
