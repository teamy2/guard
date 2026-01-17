import { NextRequest, NextResponse } from 'next/server';
import {
    getActiveConfig,
    saveConfig,
    activateConfig,
    listConfigs,
    deleteConfig
} from '@/config/storage';
import { invalidateConfigCache } from '@/config/loader';
import { GlobalConfigSchema } from '@/config/schema';
import * as Sentry from '@sentry/nextjs';

/**
 * Verify admin API key
 */
function verifyAdminAuth(request: NextRequest): boolean {
    const authHeader = request.headers.get('authorization');
    const apiKey = process.env.ADMIN_API_KEY;

    if (!apiKey) {
        // In development without key, allow access
        return process.env.NODE_ENV === 'development';
    }

    return authHeader === `Bearer ${apiKey}`;
}

/**
 * GET - List all configs or get active config
 */
export async function GET(request: NextRequest) {
    if (!verifyAdminAuth(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { searchParams } = new URL(request.url);
        const listAll = searchParams.get('list') === 'true';

        if (listAll) {
            const configs = await listConfigs();
            return NextResponse.json({ configs });
        }

        const config = await getActiveConfig();
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
    if (!verifyAdminAuth(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();

        // Validate config
        const parsed = GlobalConfigSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid config', details: parsed.error.issues },
                { status: 400 }
            );
        }

        await saveConfig(parsed.data);

        // Invalidate cache if active
        if (parsed.data.status === 'active') {
            await invalidateConfigCache();
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
    if (!verifyAdminAuth(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { version } = body;

        if (!version) {
            return NextResponse.json(
                { error: 'Version required' },
                { status: 400 }
            );
        }

        await activateConfig(version);
        await invalidateConfigCache();

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
    if (!verifyAdminAuth(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { searchParams } = new URL(request.url);
        const version = searchParams.get('version');

        if (!version) {
            return NextResponse.json(
                { error: 'Version required' },
                { status: 400 }
            );
        }

        const deleted = await deleteConfig(version);

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
