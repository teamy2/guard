import { describe, it, expect, beforeEach } from 'vitest';
import { selectBackend, setBackendHealth } from '../src/edge/route-selector';
import type { Backend, RequestFeatures, BackendHealth } from '../src/config/schema';

// Mock backends
const mockBackends: Backend[] = [
    {
        id: 'primary',
        name: 'Primary',
        url: 'https://primary.example.com',
        weight: 80,
        healthEndpoint: '/health',
        enabled: true,
    },
    {
        id: 'secondary',
        name: 'Secondary',
        url: 'https://secondary.example.com',
        weight: 20,
        healthEndpoint: '/health',
        enabled: true,
    },
    {
        id: 'disabled',
        name: 'Disabled',
        url: 'https://disabled.example.com',
        weight: 50,
        healthEndpoint: '/health',
        enabled: false,
    },
];

// Mock request features
const mockFeatures: RequestFeatures = {
    requestId: 'test-request-id',
    traceId: 'test-trace-id',
    ipHash: 'abc123',
    subnet: '192.168.1.0/24',
    method: 'GET',
    path: '/api/test',
    host: 'example.com',
    protocol: 'https',
    userAgent: 'Mozilla/5.0',
    headerCount: 12,
    hasAcceptHeader: true,
    hasCookies: true,
    cookieCount: 3,
    timestamp: Date.now(),
};

// Mock request
const mockRequest = new Request('https://example.com/api/test');

describe('Route Selector', () => {
    beforeEach(() => {
        // Clear health cache by setting all to healthy
        setBackendHealth({
            backendId: 'primary',
            healthy: true,
            lastCheck: new Date().toISOString(),
            consecutiveFailures: 0,
        });
        setBackendHealth({
            backendId: 'secondary',
            healthy: true,
            lastCheck: new Date().toISOString(),
            consecutiveFailures: 0,
        });
    });

    describe('Backend Filtering', () => {
        it('should only select from enabled backends', () => {
            const result = selectBackend(
                mockBackends,
                'random',
                'test-policy',
                mockFeatures,
                mockRequest
            );

            expect(result.backend.id).not.toBe('disabled');
            expect(['primary', 'secondary']).toContain(result.backend.id);
        });

        it('should throw error when no backends available', () => {
            const disabledBackends = mockBackends.map(b => ({ ...b, enabled: false }));

            expect(() =>
                selectBackend(
                    disabledBackends,
                    'random',
                    'test-policy',
                    mockFeatures,
                    mockRequest
                )
            ).toThrow('No enabled backends available');
        });
    });

    describe('Weighted Round Robin', () => {
        it('should select backends according to weights over time', () => {
            const selections = new Map<string, number>();

            // Run 100 selections
            for (let i = 0; i < 100; i++) {
                const result = selectBackend(
                    mockBackends.filter(b => b.enabled),
                    'weighted-round-robin',
                    'test-policy-wrr',
                    mockFeatures,
                    mockRequest
                );

                const count = selections.get(result.backend.id) || 0;
                selections.set(result.backend.id, count + 1);
            }

            // Primary should be selected more often (weight 80 vs 20)
            const primaryCount = selections.get('primary') || 0;
            const secondaryCount = selections.get('secondary') || 0;

            expect(primaryCount).toBeGreaterThan(secondaryCount);
        });

        it('should include strategy in result', () => {
            const result = selectBackend(
                mockBackends.filter(b => b.enabled),
                'weighted-round-robin',
                'test-policy',
                mockFeatures,
                mockRequest
            );

            expect(result.strategy).toBe('weighted-round-robin');
        });
    });

    describe('Health-Aware Selection', () => {
        it('should avoid unhealthy backends', () => {
            // Mark primary as unhealthy
            setBackendHealth({
                backendId: 'primary',
                healthy: false,
                lastCheck: new Date().toISOString(),
                consecutiveFailures: 3,
            });

            const result = selectBackend(
                mockBackends.filter(b => b.enabled),
                'health-aware',
                'test-policy',
                mockFeatures,
                mockRequest
            );

            expect(result.backend.id).toBe('secondary');
        });

        it('should fallback to all backends if all unhealthy', () => {
            setBackendHealth({
                backendId: 'primary',
                healthy: false,
                lastCheck: new Date().toISOString(),
                consecutiveFailures: 3,
            });
            setBackendHealth({
                backendId: 'secondary',
                healthy: false,
                lastCheck: new Date().toISOString(),
                consecutiveFailures: 3,
            });

            // Should not throw, should return one of the backends
            const result = selectBackend(
                mockBackends.filter(b => b.enabled),
                'health-aware',
                'test-policy',
                mockFeatures,
                mockRequest
            );

            expect(['primary', 'secondary']).toContain(result.backend.id);
        });
    });

    describe('Latency-Aware Selection', () => {
        it('should prefer backends with lower latency', () => {
            setBackendHealth({
                backendId: 'primary',
                healthy: true,
                lastCheck: new Date().toISOString(),
                latencyP95: 200,
                consecutiveFailures: 0,
            });
            setBackendHealth({
                backendId: 'secondary',
                healthy: true,
                lastCheck: new Date().toISOString(),
                latencyP95: 50,
                consecutiveFailures: 0,
            });

            // Run multiple times and count
            const selections = new Map<string, number>();
            for (let i = 0; i < 50; i++) {
                const result = selectBackend(
                    mockBackends.filter(b => b.enabled),
                    'latency-aware',
                    'test-policy-latency',
                    mockFeatures,
                    mockRequest
                );
                const count = selections.get(result.backend.id) || 0;
                selections.set(result.backend.id, count + 1);
            }

            // Secondary (lower latency) should be preferred
            const secondaryCount = selections.get('secondary') || 0;
            expect(secondaryCount).toBeGreaterThan(25); // Should be majority
        });
    });

    describe('Random Selection', () => {
        it('should provide random distribution', () => {
            const selections = new Map<string, number>();

            for (let i = 0; i < 100; i++) {
                const result = selectBackend(
                    mockBackends.filter(b => b.enabled),
                    'random',
                    'test-policy-random',
                    mockFeatures,
                    mockRequest
                );
                const count = selections.get(result.backend.id) || 0;
                selections.set(result.backend.id, count + 1);
            }

            // Both should be selected at least sometimes
            expect(selections.get('primary')).toBeGreaterThan(0);
            expect(selections.get('secondary')).toBeGreaterThan(0);
        });
    });

    describe('Result Object', () => {
        it('should include all required fields', () => {
            const result = selectBackend(
                mockBackends.filter(b => b.enabled),
                'weighted-round-robin',
                'test-policy',
                mockFeatures,
                mockRequest
            );

            expect(result).toHaveProperty('backend');
            expect(result).toHaveProperty('strategy');
            expect(result).toHaveProperty('candidatesCount');
            expect(result).toHaveProperty('selectionReason');
            expect(result.backend).toHaveProperty('id');
            expect(result.backend).toHaveProperty('url');
            expect(result.candidatesCount).toBe(2);
        });
    });
});
