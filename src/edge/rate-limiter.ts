import { Redis } from '@upstash/redis';
import type { RateLimitConfig, RequestFeatures } from '@/config/schema';

// Create Redis client from environment safely
// Supports both REDIS_URL and KV_REST_API_URL/TOKEN
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
 * Rate limit result
 */
export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetAt: number;
    retryAfterMs?: number;
    keyType: string;
    key: string;
}

/**
 * Generate rate limit key based on config
 */
function generateKey(
    features: RequestFeatures,
    config: RateLimitConfig,
    policyId: string
): string {
    const prefix = `rl:${policyId}`;

    switch (config.keyType) {
        case 'ip':
            return `${prefix}:ip:${features.ipHash}`;
        case 'subnet':
            return `${prefix}:subnet:${features.subnet}`;
        case 'session':
            return features.sessionId
                ? `${prefix}:session:${features.sessionId}`
                : `${prefix}:ip:${features.ipHash}`; // Fallback to IP
        case 'endpoint':
            return `${prefix}:endpoint:${features.method}:${features.path}`;
        case 'composite':
            return `${prefix}:composite:${features.ipHash}:${features.path}`;
        default:
            return `${prefix}:ip:${features.ipHash}`;
    }
}

/**
 * Sliding window rate limiter using Upstash Redis (via REST API)
 * Uses a simple counter with TTL approach for efficiency
 * Compatible with Vercel KV (which uses the same API)
 */
export async function checkRateLimit(
    features: RequestFeatures,
    config: RateLimitConfig,
    policyId: string
): Promise<RateLimitResult> {
    if (!config.enabled) {
        return {
            allowed: true,
            remaining: config.maxRequests,
            resetAt: Date.now() + config.windowMs,
            keyType: config.keyType,
            key: '',
        };
    }

    const key = generateKey(features, config, policyId);
    const windowSeconds = Math.ceil(config.windowMs / 1000);

    try {
        if (!redis) {
            // Fail open if Redis not configured
            console.warn('[RateLimiter] Redis not configured, failing open');
            return {
                allowed: true,
                remaining: config.maxRequests,
                resetAt: Date.now() + config.windowMs,
                keyType: config.keyType,
                key,
            };
        }

        // Increment counter and get new value
        const pipeline = redis.pipeline();
        pipeline.incr(key);
        pipeline.ttl(key);

        const results = await pipeline.exec();
        const count = results[0] as number;
        const ttl = results[1] as number;

        // Set TTL on first request in window
        if (ttl === -1) {
            await redis.expire(key, windowSeconds);
        }

        const remaining = Math.max(0, config.maxRequests - count);
        const resetAt = Date.now() + (ttl > 0 ? ttl * 1000 : config.windowMs);

        // Check if limit exceeded
        const allowed = count <= config.maxRequests ||
            (config.burstLimit !== undefined && count <= config.maxRequests + config.burstLimit);

        // Calculate retryAfterMs as time remaining until reset (decreases over time)
        const retryAfterMs = allowed ? undefined : Math.max(0, resetAt - Date.now());

        return {
            allowed,
            remaining,
            resetAt,
            retryAfterMs,
            keyType: config.keyType,
            key,
        };
    } catch (error) {
        // On KV error, allow the request (fail open) but log
        console.error('[RateLimiter] KV error:', error);

        return {
            allowed: true,
            remaining: config.maxRequests,
            resetAt: Date.now() + config.windowMs,
            keyType: config.keyType,
            key,
        };
    }
}

/**
 * Get current request count for a key (for feature extraction)
 */
export async function getRequestCount(
    features: RequestFeatures,
    config: RateLimitConfig,
    policyId: string
): Promise<number> {
    if (!redis) return 0;

    const key = generateKey(features, config, policyId);

    try {
        const count = await redis.get<number>(key);
        return count ?? 0;
    } catch {
        return 0;
    }
}

/**
 * Reset rate limit for a key (admin function)
 */
export async function resetRateLimit(
    key: string
): Promise<void> {
    if (!redis) return;
    await redis.del(key);
}

/**
 * Get rate limit headers for response
 */
export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
    const headers: Record<string, string> = {
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
    };

    if (!result.allowed && result.retryAfterMs) {
        headers['Retry-After'] = String(Math.ceil(result.retryAfterMs / 1000));
    }

    return headers;
}
