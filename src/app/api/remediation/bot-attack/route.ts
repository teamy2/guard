import { NextRequest, NextResponse } from 'next/server';
import { getActiveConfig, saveConfig } from '@/config/storage';
import { invalidateConfigCache } from '@/config/loader';
import { sql } from '@vercel/postgres';
import * as Sentry from '@sentry/nextjs';
import type { GlobalConfig, RateLimitConfig } from '@/config/schema';

/**
 * Detect if a bot attack is currently happening
 * Criteria:
 * - High rate of bot blocks/challenges in recent time window
 * - Many requests with high bot scores
 * - Sudden spike in bot-related decisions
 */
async function detectBotAttack(windowMinutes: number = 5): Promise<{
    isAttack: boolean;
        metrics: {
            totalRequests: number;
            botBlocks: number;
            botChallenges: number;
            throttles: number;
            highBotScores: number;
            attackScore: number;
        };
}> {
    const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();

    try {
        // Query recent bot-related metrics
        const result = await sql`
            SELECT 
                COUNT(*) as total_requests,
                SUM(CASE WHEN decision = 'block' THEN 1 ELSE 0 END) as bot_blocks,
                SUM(CASE WHEN decision = 'challenge' THEN 1 ELSE 0 END) as bot_challenges,
                SUM(CASE WHEN decision = 'throttle' THEN 1 ELSE 0 END) as throttles,
                SUM(CASE WHEN bot_score >= 0.7 THEN 1 ELSE 0 END) as high_bot_scores,
                AVG(bot_score) as avg_bot_score
            FROM request_metrics
            WHERE timestamp >= ${since}
        `;

        const row = result.rows[0];
        const totalRequests = parseInt(row.total_requests || '0', 10);
        const botBlocks = parseInt(row.bot_blocks || '0', 10);
        const botChallenges = parseInt(row.bot_challenges || '0', 10);
        const throttles = parseInt(row.throttles || '0', 10);
        const highBotScores = parseInt(row.high_bot_scores || '0', 10);
        const avgBotScore = parseFloat(row.avg_bot_score || '0');

        // Calculate attack score (0-1)
        // Higher score = more likely an attack
        const blockRate = totalRequests > 0 ? botBlocks / totalRequests : 0;
        const challengeRate = totalRequests > 0 ? botChallenges / totalRequests : 0;
        const highScoreRate = totalRequests > 0 ? highBotScores / totalRequests : 0;
        
        // Attack indicators:
        // - >10% block rate
        // - >20% challenge rate
        // - >30% high bot scores
        // - High average bot score (>0.6)
        const attackScore = Math.min(1, (
            (blockRate * 2) + // Blocks are strong indicator
            (challengeRate * 1.5) + // Challenges are moderate indicator
            (highScoreRate * 1.2) + // High scores are moderate indicator
            (avgBotScore > 0.6 ? 0.3 : 0) // High average score
        ));

        const isAttack = attackScore > 0.4; // Threshold for attack detection

        return {
            isAttack,
            metrics: {
                totalRequests,
                botBlocks,
                botChallenges,
                throttles,
                highBotScores,
                attackScore,
            },
        };
    } catch (error) {
        console.error('[BotAttackDetection] Error detecting attack:', error);
        Sentry.captureException(error);
        return {
            isAttack: false,
            metrics: {
                totalRequests: 0,
                botBlocks: 0,
                botChallenges: 0,
                throttles: 0,
                highBotScores: 0,
                attackScore: 0,
            },
        };
    }
}

/**
 * Adjust rate limits to be more restrictive during bot attacks
 */
function adjustRateLimitsForAttack(
    currentConfig: RateLimitConfig
): RateLimitConfig {
    // Reduce max requests by 50-70% during attack
    const reductionFactor = 0.4; // Keep only 40% of original (60% reduction)
    const newMaxRequests = Math.max(
        10, // Minimum 10 requests per window
        Math.floor(currentConfig.maxRequests * reductionFactor)
    );

    // Reduce window size to make limits more aggressive
    const newWindowMs = Math.min(
        currentConfig.windowMs,
        Math.max(30000, currentConfig.windowMs * 0.7) // At least 30s, or 70% of original
    );

    // Disable burst limit during attacks
    return {
        ...currentConfig,
        maxRequests: newMaxRequests,
        windowMs: newWindowMs,
        burstLimit: undefined, // No burst during attacks
        enabled: true, // Ensure rate limiting is enabled
    };
}

/**
 * POST - Check for bot attacks and automatically adjust rate limits
 * Designed to be called by Sentry webhooks when bot attack alerts trigger
 * 
 * Sentry webhook payload structure:
 * {
 *   "action": "triggered" | "resolved",
 *   "data": {
 *     "event": { ... },
 *     "triggered_rule": { ... }
 *   }
 * }
 */
export async function POST(request: NextRequest) {
    try {
        // Verify webhook secret (required for Sentry webhooks)
        const authHeader = request.headers.get('authorization');
        const webhookSecret = process.env.SENTRY_WEBHOOK_SECRET;
        
        if (!webhookSecret) {
            console.warn('[BotAttackRemediation] SENTRY_WEBHOOK_SECRET not set - webhook authentication disabled');
        } else if (authHeader !== `Bearer ${webhookSecret}`) {
            return NextResponse.json(
                { error: 'Unauthorized - Invalid webhook secret' },
                { status: 401 }
            );
        }

        // Parse Sentry webhook payload (optional - we'll check for attacks regardless)
        let sentryPayload: any = null;
        try {
            const body = await request.json();
            sentryPayload = body;
            
            // Log Sentry webhook details
            Sentry.addBreadcrumb({
                category: 'sentry.webhook',
                message: 'Sentry webhook received',
                level: 'info',
                data: {
                    action: sentryPayload.action,
                    rule_id: sentryPayload.data?.triggered_rule?.id,
                    event_id: sentryPayload.data?.event?.eventID,
                },
            });
        } catch (e) {
            // Not a JSON payload or empty body - that's okay, we'll still check for attacks
            console.log('[BotAttackRemediation] No Sentry payload provided, checking for attacks anyway');
        }

        // Detect bot attack
        const detection = await detectBotAttack(5); // Check last 5 minutes

        Sentry.addBreadcrumb({
            category: 'remediation',
            message: 'Bot attack detection check',
            level: detection.isAttack ? 'warning' : 'info',
            data: detection.metrics,
        });

        if (!detection.isAttack) {
            return NextResponse.json({
                success: true,
                action: 'no_action',
                message: 'No bot attack detected',
                metrics: detection.metrics,
            });
        }

        // Attack detected - adjust rate limits
        console.log('[BotAttackRemediation] Bot attack detected! Adjusting rate limits...', detection.metrics);

        // Get current active config
        const currentConfig = await getActiveConfig();

        // Create updated config with adjusted rate limits
        const updatedConfig: GlobalConfig = {
            ...currentConfig,
            defaultRateLimit: adjustRateLimitsForAttack(currentConfig.defaultRateLimit),
            // Also adjust rate limits in policies
            policies: currentConfig.policies.map(policy => ({
                ...policy,
                rateLimit: policy.rateLimit
                    ? adjustRateLimitsForAttack(policy.rateLimit)
                    : adjustRateLimitsForAttack(currentConfig.defaultRateLimit),
            })),
            updatedAt: new Date().toISOString(),
        };

        // Save updated config
        await saveConfig(updatedConfig);
        
        // If this is the active config, invalidate cache
        if (currentConfig.status === 'active') {
            await invalidateConfigCache();
        }

        // Log to Sentry
        Sentry.withScope((scope) => {
            scope.setTag('remediation', 'bot_attack');
            scope.setTag('action', 'rate_limit_adjustment');
            scope.setContext('attack_metrics', detection.metrics);
            scope.setContext('rate_limit_changes', {
                old_max_requests: currentConfig.defaultRateLimit.maxRequests,
                new_max_requests: updatedConfig.defaultRateLimit.maxRequests,
                old_window_ms: currentConfig.defaultRateLimit.windowMs,
                new_window_ms: updatedConfig.defaultRateLimit.windowMs,
            });
            
            Sentry.captureMessage('Bot attack detected - rate limits automatically adjusted', 'warning');
        });

        return NextResponse.json({
            success: true,
            action: 'rate_limits_adjusted',
            message: 'Bot attack detected - rate limits automatically reduced',
            metrics: detection.metrics,
            changes: {
                old_max_requests: currentConfig.defaultRateLimit.maxRequests,
                new_max_requests: updatedConfig.defaultRateLimit.maxRequests,
                old_window_ms: currentConfig.defaultRateLimit.windowMs,
                new_window_ms: updatedConfig.defaultRateLimit.windowMs,
            },
        });
    } catch (error) {
        console.error('[BotAttackRemediation] Error:', error);
        Sentry.captureException(error);
        return NextResponse.json(
            { error: 'Failed to process remediation' },
            { status: 500 }
        );
    }
}

/**
 * GET - Check current bot attack status (for monitoring)
 */
export async function GET(request: NextRequest) {
    try {
        const detection = await detectBotAttack(5);
        return NextResponse.json({
            isAttack: detection.isAttack,
            metrics: detection.metrics,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        Sentry.captureException(error);
        return NextResponse.json(
            { error: 'Failed to check attack status' },
            { status: 500 }
        );
    }
}
