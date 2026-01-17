import { describe, it, expect, beforeAll } from 'vitest';

/**
 * Integration tests for Bot Guard.
 * 
 * Run with: TEST_URL=https://your-prod-url.com pnpm test integration
 * Default URL: http://localhost:3000
 */
describe('Bot Protection Integration', () => {
    let baseUrl: string;

    beforeAll(() => {
        baseUrl = process.env.TEST_URL || 'http://localhost:3000';
        // Remove trailing slash if present
        if (baseUrl.endsWith('/')) {
            baseUrl = baseUrl.slice(0, -1);
        }
        console.log(`Running integration tests against: ${baseUrl}`);
    });

    it('should allow legitimate browser-like traffic', async () => {
        // Target root path instead of /api/health which is excluded
        const response = await fetch(`${baseUrl}/`, {
            redirect: 'manual', // Don't follow redirects automatically
            headers: {
                // Mimic a real browser
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
            }
        });

        // Should NOT be 403 Forbidden
        expect(response.status).not.toBe(403);

        // Should NOT exclude challenge redirect
        const location = response.headers.get('location');
        if (response.status === 302 || response.status === 307) {
            expect(location).not.toContain('challenge');
        }
    });

    it('should challenge or block requests with missing User-Agent', async () => {
        const response = await fetch(`${baseUrl}/`, {
            redirect: 'manual',
            headers: {
                // Intentionally empty or missing UA
                'User-Agent': ''
            }
        });

        // Expecting a challenge (302 Redirect to challenge) or Block (403)
        const isBlock = response.status === 403;
        const isChallengeRedirect = (response.status === 302 || response.status === 307) &&
            response.headers.get('location')?.includes('challenge');

        if (!isBlock && !isChallengeRedirect) {
            console.log('Status:', response.status);
            console.log('Location:', response.headers.get('location'));
        }

        expect(isBlock || isChallengeRedirect).toBe(true);
    });

    it('should challenge or block known bot User-Agents', async () => {
        const response = await fetch(`${baseUrl}/`, {
            redirect: 'manual',
            headers: {
                'User-Agent': 'python-requests/2.28.0'
            }
        });

        const isBlock = response.status === 403;
        const isChallengeRedirect = (response.status === 302 || response.status === 307) &&
            response.headers.get('location')?.includes('challenge');

        expect(isBlock || isChallengeRedirect).toBe(true);
    });
});
