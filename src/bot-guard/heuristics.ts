import type { RequestFeatures, BotScoringResult, BotGuardConfig } from '@/config/schema';

/**
 * Bot detection heuristic rules
 * Each rule has a weight that contributes to the final score
 */
interface HeuristicRule {
    id: string;
    name: string;
    weight: number; // 0.0 to 1.0, contribution to bot score
    evaluate: (features: RequestFeatures) => { triggered: boolean; explanation: string };
}

/**
 * Known bot user agent patterns
 */
const BOT_UA_PATTERNS = [
    /bot/i,
    /crawler/i,
    /spider/i,
    /scraper/i,
    /curl/i,
    /wget/i,
    /python-requests/i,
    /httpx/i,
    /axios/i,
    /node-fetch/i,
    /go-http-client/i,
    /java\//i,
    /libwww/i,
    /headless/i,
    /phantom/i,
    /selenium/i,
    /puppeteer/i,
    /playwright/i,
];

/**
 * Known good bot patterns (search engines, etc.)
 */
const GOOD_BOT_PATTERNS = [
    /googlebot/i,
    /bingbot/i,
    /yandexbot/i,
    /duckduckbot/i,
    /baiduspider/i,
    /facebookexternalhit/i,
    /twitterbot/i,
    /linkedinbot/i,
    /slackbot/i,
    /discordbot/i,
];

/**
 * Suspicious header patterns
 */
const SUSPICIOUS_ACCEPT_LANGUAGE = [
    /^[a-z]{2}$/i, // Just "en" without region
    /^\*$/,        // Wildcard only
];

/**
 * All heuristic rules for bot detection
 */
const HEURISTIC_RULES: HeuristicRule[] = [
    // Missing or empty User-Agent
    {
        id: 'missing_ua',
        name: 'Missing User-Agent',
        weight: 0.4,
        evaluate: (f) => ({
            triggered: !f.userAgent || f.userAgent.length === 0,
            explanation: 'Request has no User-Agent header',
        }),
    },

    // Very short User-Agent
    {
        id: 'short_ua',
        name: 'Short User-Agent',
        weight: 0.2,
        evaluate: (f) => ({
            triggered: f.userAgent.length > 0 && f.userAgent.length < 20,
            explanation: `User-Agent is suspiciously short (${f.userAgent.length} chars)`,
        }),
    },

    // Known bot User-Agent patterns
    {
        id: 'bot_ua_pattern',
        name: 'Bot User-Agent Pattern',
        weight: 0.5,
        evaluate: (f) => {
            const isBot = BOT_UA_PATTERNS.some(p => p.test(f.userAgent));
            const isGoodBot = GOOD_BOT_PATTERNS.some(p => p.test(f.userAgent));
            return {
                triggered: isBot && !isGoodBot,
                explanation: 'User-Agent matches known bot patterns',
            };
        },
    },

    // Missing Accept header
    {
        id: 'missing_accept',
        name: 'Missing Accept Header',
        weight: 0.25,
        evaluate: (f) => ({
            triggered: !f.hasAcceptHeader,
            explanation: 'Request missing Accept header (unusual for browsers)',
        }),
    },

    // Missing Accept-Language
    {
        id: 'missing_accept_language',
        name: 'Missing Accept-Language',
        weight: 0.2,
        evaluate: (f) => ({
            triggered: !f.acceptLanguage,
            explanation: 'Request missing Accept-Language header',
        }),
    },

    // Suspicious Accept-Language format
    {
        id: 'suspicious_accept_language',
        name: 'Suspicious Accept-Language',
        weight: 0.15,
        evaluate: (f) => {
            if (!f.acceptLanguage) return { triggered: false, explanation: '' };
            const suspicious = SUSPICIOUS_ACCEPT_LANGUAGE.some(p => p.test(f.acceptLanguage!));
            return {
                triggered: suspicious,
                explanation: 'Accept-Language has unusual format',
            };
        },
    },

    // Very few headers
    {
        id: 'few_headers',
        name: 'Few Headers',
        weight: 0.2,
        evaluate: (f) => ({
            triggered: f.headerCount < 5,
            explanation: `Only ${f.headerCount} headers (browsers typically send more)`,
        }),
    },

    // No cookies on non-first request
    {
        id: 'no_cookies_returning',
        name: 'No Cookies (Returning)',
        weight: 0.1,
        evaluate: (f) => ({
            // This is a weak signal - only triggered if there's a referer (indicating navigation)
            triggered: !f.hasCookies && !!f.referer,
            explanation: 'Returning visitor with no cookies',
        }),
    },

    // Missing Accept-Encoding
    {
        id: 'missing_accept_encoding',
        name: 'Missing Accept-Encoding',
        weight: 0.15,
        evaluate: (f) => ({
            triggered: !f.acceptEncoding,
            explanation: 'Request missing Accept-Encoding header',
        }),
    },

    // Direct access without referer to deep paths
    {
        id: 'deep_path_no_referer',
        name: 'Deep Path Without Referer',
        weight: 0.1,
        evaluate: (f) => {
            const pathDepth = f.path.split('/').filter(Boolean).length;
            return {
                triggered: pathDepth > 2 && !f.referer,
                explanation: `Deep path (${pathDepth} levels) accessed without referer`,
            };
        },
    },

    // Unusual HTTP method combinations
    {
        id: 'unusual_method',
        name: 'Unusual HTTP Method',
        weight: 0.3,
        evaluate: (f) => {
            const unusual = ['TRACE', 'CONNECT', 'OPTIONS'].includes(f.method);
            return {
                triggered: unusual,
                explanation: `Unusual HTTP method: ${f.method}`,
            };
        },
    },

    // High-frequency request pattern (if rate data available)
    {
        id: 'high_frequency',
        name: 'High Request Frequency',
        weight: 0.35,
        evaluate: (f) => ({
            triggered: (f.requestsInWindow || 0) > 50,
            explanation: `High request rate: ${f.requestsInWindow} requests in window`,
        }),
    },
];

/**
 * Calculate the bot score based on heuristic rules
 */
export function calculateBotScore(features: RequestFeatures): {
    score: number;
    reasons: BotScoringResult['reasons'];
} {
    const reasons: BotScoringResult['reasons'] = [];
    let totalWeight = 0;
    let triggeredWeight = 0;

    for (const rule of HEURISTIC_RULES) {
        const result = rule.evaluate(features);

        reasons.push({
            rule: rule.id,
            weight: rule.weight,
            triggered: result.triggered,
            explanation: result.explanation,
        });

        totalWeight += rule.weight;
        if (result.triggered) {
            triggeredWeight += rule.weight;
        }
    }

    // Calculate additive score capped at 1.0
    // Each rule's weight represents its direct contribution to the probability
    const score = Math.min(1, triggeredWeight);

    return { score, reasons };
}

/**
 * Determine the bot bucket based on score and thresholds
 */
export function getBotBucket(
    score: number,
    thresholds: { low: number; medium: number; high: number }
): 'low' | 'medium' | 'high' {
    if (score >= thresholds.high) return 'high';
    // Use low threshold as the start of medium bucket (i.e. if score > low, it's at least medium)
    if (score >= thresholds.low) return 'medium';
    return 'low';
}

/**
 * Get the action for a given bot bucket
 */
export function getActionForBucket(
    bucket: 'low' | 'medium' | 'high',
    actions: { low: string; medium: string; high: string }
): 'allow' | 'challenge' | 'throttle' | 'block' | 'reroute' {
    return actions[bucket] as 'allow' | 'challenge' | 'throttle' | 'block' | 'reroute';
}

/**
 * Main entry point: evaluate request and return scoring result
 */
export function evaluateBotScore(
    features: RequestFeatures,
    config: BotGuardConfig
): BotScoringResult {
    const { score, reasons } = calculateBotScore(features);
    const bucket = getBotBucket(score, config.thresholds);
    const decision = getActionForBucket(bucket, config.actions);

    return {
        score,
        bucket,
        decision,
        reasons,
    };
}

/**
 * Check if a request should be allowed based on allow/block lists
 * Returns: 'allow' | 'block' | 'continue' (continue to normal evaluation)
 */
export function checkAllowBlockLists(
    ipHash: string,
    allowlist?: string[],
    blocklist?: string[]
): 'allow' | 'block' | 'continue' {
    // Check blocklist first
    if (blocklist?.includes(ipHash)) {
        return 'block';
    }

    // Check allowlist
    if (allowlist?.includes(ipHash)) {
        return 'allow';
    }

    return 'continue';
}
