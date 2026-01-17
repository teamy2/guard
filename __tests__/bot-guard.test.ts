import { describe, it, expect, vi } from 'vitest';
import {
    calculateBotScore,
    getBotBucket,
    getActionForBucket,
    checkAllowBlockLists,
} from '../src/bot-guard/heuristics';
import type { RequestFeatures, BotGuardConfig } from '../src/config/schema';

// Mock request features
function createMockFeatures(overrides: Partial<RequestFeatures> = {}): RequestFeatures {
    return {
        requestId: 'test-request-id',
        traceId: 'test-trace-id',
        ipHash: 'abc123',
        subnet: '192.168.1.0/24',
        method: 'GET',
        path: '/api/test',
        host: 'example.com',
        protocol: 'https',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        headerCount: 12,
        hasAcceptHeader: true,
        hasCookies: true,
        cookieCount: 3,
        timestamp: Date.now(),
        acceptLanguage: 'en-US,en;q=0.9',
        acceptEncoding: 'gzip, deflate, br',
        ...overrides,
    };
}

describe('Bot Guard Heuristics', () => {
    describe('calculateBotScore', () => {
        it('should return low score for normal browser requests', () => {
            const features = createMockFeatures();
            const result = calculateBotScore(features);

            expect(result.score).toBeLessThan(0.3);
            expect(result.reasons.filter(r => r.triggered)).toHaveLength(0);
        });

        it('should return high score for missing user agent', () => {
            const features = createMockFeatures({ userAgent: '' });
            const result = calculateBotScore(features);

            expect(result.score).toBeGreaterThan(0.3);
            expect(result.reasons.find(r => r.rule === 'missing_ua')?.triggered).toBe(true);
        });

        it('should detect known bot patterns', () => {
            const features = createMockFeatures({ userAgent: 'python-requests/2.28.0' });
            const result = calculateBotScore(features);

            expect(result.score).toBeGreaterThan(0.3);
            expect(result.reasons.find(r => r.rule === 'bot_ua_pattern')?.triggered).toBe(true);
        });

        it('should not flag good bots', () => {
            const features = createMockFeatures({
                userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
            });
            const result = calculateBotScore(features);

            expect(result.reasons.find(r => r.rule === 'bot_ua_pattern')?.triggered).toBe(false);
        });

        it('should flag requests with too few headers', () => {
            const features = createMockFeatures({ headerCount: 3 });
            const result = calculateBotScore(features);

            expect(result.reasons.find(r => r.rule === 'few_headers')?.triggered).toBe(true);
        });

        it('should flag missing accept header', () => {
            const features = createMockFeatures({ hasAcceptHeader: false });
            const result = calculateBotScore(features);

            expect(result.reasons.find(r => r.rule === 'missing_accept')?.triggered).toBe(true);
        });

        it('should flag high frequency requests', () => {
            const features = createMockFeatures({ requestsInWindow: 100 });
            const result = calculateBotScore(features);

            expect(result.reasons.find(r => r.rule === 'high_frequency')?.triggered).toBe(true);
        });
    });

    describe('getBotBucket', () => {
        const thresholds = { low: 0.3, medium: 0.6, high: 0.85 };

        it('should return low for scores below low threshold', () => {
            expect(getBotBucket(0.1, thresholds)).toBe('low');
            expect(getBotBucket(0.29, thresholds)).toBe('low');
        });

        it('should return medium for scores between low and medium', () => {
            expect(getBotBucket(0.3, thresholds)).toBe('medium');
            expect(getBotBucket(0.5, thresholds)).toBe('medium');
        });

        it('should return high for scores above high threshold', () => {
            expect(getBotBucket(0.85, thresholds)).toBe('high');
            expect(getBotBucket(0.99, thresholds)).toBe('high');
        });
    });

    describe('getActionForBucket', () => {
        const actions = { low: 'allow', medium: 'challenge', high: 'block' } as const;

        it('should return correct action for each bucket', () => {
            expect(getActionForBucket('low', actions)).toBe('allow');
            expect(getActionForBucket('medium', actions)).toBe('challenge');
            expect(getActionForBucket('high', actions)).toBe('block');
        });
    });

    describe('checkAllowBlockLists', () => {
        it('should return allow for allowed IPs', () => {
            expect(checkAllowBlockLists('allowed-ip', ['allowed-ip'], [])).toBe('allow');
        });

        it('should return block for blocked IPs', () => {
            expect(checkAllowBlockLists('blocked-ip', [], ['blocked-ip'])).toBe('block');
        });

        it('should return continue for unknown IPs', () => {
            expect(checkAllowBlockLists('unknown-ip', ['other-ip'], ['another-ip'])).toBe('continue');
        });

        it('should prioritize blocklist over allowlist', () => {
            // If IP is on both lists, block wins
            expect(checkAllowBlockLists('dual-ip', ['dual-ip'], ['dual-ip'])).toBe('block');
        });
    });
});

describe('Bot Guard Integration', () => {
    it('should block requests that look like scrapers', () => {
        const features = createMockFeatures({
            userAgent: 'python-requests/2.28.0',
            headerCount: 4,
            hasAcceptHeader: false,
            acceptLanguage: undefined,
            acceptEncoding: undefined,
        });

        const result = calculateBotScore(features);
        const bucket = getBotBucket(result.score, { low: 0.3, medium: 0.6, high: 0.85 });

        // Should be at least medium risk
        expect(['medium', 'high']).toContain(bucket);
    });

    it('should allow legitimate browser traffic', () => {
        const features = createMockFeatures({
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            headerCount: 15,
            hasAcceptHeader: true,
            hasCookies: true,
            cookieCount: 5,
            acceptLanguage: 'en-US,en;q=0.9,fr;q=0.8',
            acceptEncoding: 'gzip, deflate, br',
            referer: 'https://example.com/',
        });

        const result = calculateBotScore(features);
        const bucket = getBotBucket(result.score, { low: 0.3, medium: 0.6, high: 0.85 });

        expect(bucket).toBe('low');
    });
});
