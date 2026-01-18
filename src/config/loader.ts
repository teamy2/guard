import { Redis } from '@upstash/redis';
import type { GlobalConfig } from './schema';
import { getActiveConfig as getActiveConfigFromDB } from './storage';

const CONFIG_CACHE_TTL = 60; // 1 minute cache

function getConfigCacheKey(domain: string): string {
    return `lb:config:${domain}`;
}

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
 * Uses Upstash Redis (via REST API) for fast access at the edge
 */
export async function loadConfig(domain: string = 'localhost'): Promise<GlobalConfig> {
    try {
        let cached: GlobalConfig | null = null;
        const cacheKey = getConfigCacheKey(domain);

        // Try to get from KV cache first if available
        if (redis) {
            try {
                cached = await redis.get<GlobalConfig>(cacheKey);
            } catch (e) {
                console.warn('[ConfigLoader] KV cache error:', e);
            }
        }

        if (cached) {
            return cached;
        }

        // Load from database
        const config = await getActiveConfigFromDB(domain);

        // Cache in KV for fast edge access
        if (redis) {
            try {
                await redis.set(cacheKey, config, { ex: CONFIG_CACHE_TTL });
            } catch (e) {
                console.warn('[ConfigLoader] Failed to cache config:', e);
            }
        }

        return config;
    } catch (error) {
        console.error('[ConfigLoader] Failed to load config:', error);
        console.log('[ConfigLoader] Using fallback config (empty backends)');

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
export async function invalidateConfigCache(domain: string = 'localhost'): Promise<void> {
    if (redis) {
        await redis.del(getConfigCacheKey(domain));
    }
}

/**
 * Warm the config cache (called on deploy or cron)
 */
export async function warmConfigCache(domain: string = 'localhost'): Promise<void> {
    const config = await getActiveConfigFromDB(domain);
    if (redis) {
        await redis.set(getConfigCacheKey(domain), config, { ex: CONFIG_CACHE_TTL });
    }
}
