import { kv } from '@vercel/kv';
import type { GlobalConfig } from './schema';
import { getActiveConfig as getActiveConfigFromDB } from './storage';

const CONFIG_CACHE_KEY = 'lb:config:active';
const CONFIG_CACHE_TTL = 60; // 1 minute cache

/**
 * Configuration loader with caching for Edge runtime
 * Uses Vercel KV for fast access at the edge
 */
export async function loadConfig(): Promise<GlobalConfig> {
    try {
        // Try to get from KV cache first
        const cached = await kv.get<GlobalConfig>(CONFIG_CACHE_KEY);

        if (cached) {
            return cached;
        }

        // Load from database
        const config = await getActiveConfigFromDB();

        // Cache in KV for fast edge access
        await kv.set(CONFIG_CACHE_KEY, config, { ex: CONFIG_CACHE_TTL });

        return config;
    } catch (error) {
        console.error('[ConfigLoader] Failed to load config:', error);

        // Return a minimal fallback config
        return {
            version: 'fallback',
            status: 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            backends: [],
            policies: [],
            defaultRateLimit: {
                enabled: false,
                windowMs: 60000,
                maxRequests: 1000,
                keyType: 'ip',
                subnetMask: 24,
                retryAfterMs: 60000,
            },
            defaultBotGuard: {
                enabled: false,
                thresholds: { low: 0.3, medium: 0.6, high: 0.85 },
                actions: { low: 'allow', medium: 'allow', high: 'allow' },
                useAiClassifier: false,
                aiTimeoutMs: 50,
            },
            defaultStrategy: 'weighted-round-robin',
            telemetrySampleRate: 0.1,
            challengePageUrl: '/challenge',
        };
    }
}

/**
 * Invalidate the config cache (called after admin updates)
 */
export async function invalidateConfigCache(): Promise<void> {
    await kv.del(CONFIG_CACHE_KEY);
}

/**
 * Warm the config cache (called on deploy or cron)
 */
export async function warmConfigCache(): Promise<void> {
    const config = await getActiveConfigFromDB();
    await kv.set(CONFIG_CACHE_KEY, config, { ex: CONFIG_CACHE_TTL });
}
