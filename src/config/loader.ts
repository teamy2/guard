import { Redis } from '@upstash/redis';
import type { GlobalConfig } from './schema';
import { getActiveConfig as getActiveConfigFromDB } from './storage';

const CONFIG_CACHE_KEY = 'lb:config:active';
const CONFIG_CACHE_TTL = 60; // 1 minute cache

// Create Redis client safely
function createRedisClient() {
    const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

    if (url && token) {
        return new Redis({ url, token });
    }
    return null;
}

const redis = createRedisClient();

/**
 * Configuration loader with caching for Edge runtime
 * Uses Vercel KV for fast access at the edge
 */
export async function loadConfig(): Promise<GlobalConfig> {
    try {
        let cached: GlobalConfig | null = null;

        // Try to get from KV cache first if available
        if (redis) {
            try {
                cached = await redis.get<GlobalConfig>(CONFIG_CACHE_KEY);
            } catch (e) {
                console.warn('[ConfigLoader] KV cache error:', e);
            }
        }

        if (cached) {
            return cached;
        }

        // Load from database
        const config = await getActiveConfigFromDB();

        // Cache in KV for fast edge access
        if (redis) {
            try {
                await redis.set(CONFIG_CACHE_KEY, config, { ex: CONFIG_CACHE_TTL });
            } catch (e) {
                console.warn('[ConfigLoader] Failed to cache config:', e);
            }
        }

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
    if (redis) {
        await redis.del(CONFIG_CACHE_KEY);
    }
}

/**
 * Warm the config cache (called on deploy or cron)
 */
export async function warmConfigCache(): Promise<void> {
    const config = await getActiveConfigFromDB();
    if (redis) {
        await redis.set(CONFIG_CACHE_KEY, config, { ex: CONFIG_CACHE_TTL });
    }
}
