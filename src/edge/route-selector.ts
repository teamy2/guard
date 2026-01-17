import type {
    Backend,
    BackendHealth,
    LoadBalancerStrategy,
    StickyConfig,
    LoadBalancerResult,
    RequestFeatures
} from '@/config/schema';

/**
 * In-memory cache for backend health (populated by cron)
 * In production, this would be loaded from KV
 */
const healthCache = new Map<string, BackendHealth>();

/**
 * Round-robin counter (per-policy)
 */
const rrCounters = new Map<string, number>();

/**
 * Set backend health in cache
 */
export function setBackendHealth(health: BackendHealth): void {
    healthCache.set(health.backendId, health);
}

/**
 * Get backend health from cache
 */
export function getBackendHealth(backendId: string): BackendHealth | undefined {
    return healthCache.get(backendId);
}

/**
 * Filter backends by health status
 */
function filterHealthyBackends(backends: Backend[]): Backend[] {
    return backends.filter(b => {
        const health = healthCache.get(b.id);
        // Consider healthy if no health data or explicitly healthy
        return !health || health.healthy;
    });
}

/**
 * Weighted random selection
 */
function selectWeighted(backends: Backend[]): Backend {
    const totalWeight = backends.reduce((sum, b) => sum + b.weight, 0);
    const random = Math.random() * totalWeight;

    let cumulative = 0;
    for (const backend of backends) {
        cumulative += backend.weight;
        if (random <= cumulative) {
            return backend;
        }
    }

    return backends[backends.length - 1];
}

/**
 * Round-robin selection with weights
 */
function selectRoundRobin(backends: Backend[], policyId: string): Backend {
    const counter = rrCounters.get(policyId) ?? 0;

    // Expand backends by weight for proper round-robin
    const expanded: Backend[] = [];
    for (const backend of backends) {
        const count = Math.max(1, Math.round(backend.weight));
        for (let i = 0; i < count; i++) {
            expanded.push(backend);
        }
    }

    const index = counter % expanded.length;
    rrCounters.set(policyId, counter + 1);

    return expanded[index];
}

/**
 * Latency-aware selection (prefer lower p95)
 */
function selectLatencyAware(backends: Backend[]): Backend {
    // Sort by p95 latency (ascending)
    const withLatency = backends.map(b => ({
        backend: b,
        latency: healthCache.get(b.id)?.latencyP95 ?? Infinity,
    }));

    withLatency.sort((a, b) => a.latency - b.latency);

    // Add some randomness to avoid thundering herd
    // Pick from top 3 (or fewer) weighted by inverse latency
    const topN = withLatency.slice(0, Math.min(3, withLatency.length));

    if (topN.length === 1) {
        return topN[0].backend;
    }

    // Weight inversely by latency
    const maxLatency = Math.max(...topN.map(t => t.latency === Infinity ? 1000 : t.latency));
    const weights = topN.map(t => maxLatency - (t.latency === Infinity ? 1000 : t.latency) + 1);
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    const random = Math.random() * totalWeight;
    let cumulative = 0;

    for (let i = 0; i < topN.length; i++) {
        cumulative += weights[i];
        if (random <= cumulative) {
            return topN[i].backend;
        }
    }

    return topN[0].backend;
}

/**
 * Sticky selection (cookie or header based)
 */
function selectSticky(
    backends: Backend[],
    features: RequestFeatures,
    stickyConfig: StickyConfig,
    request: Request
): { backend: Backend; isSticky: boolean } {
    let stickyBackendId: string | undefined;

    if (stickyConfig.type === 'header') {
        stickyBackendId = request.headers.get(stickyConfig.headerName) ?? undefined;
    } else {
        // Cookie-based
        const cookieHeader = request.headers.get('cookie');
        if (cookieHeader) {
            const cookies = cookieHeader.split(';').map(c => c.trim());
            const stickyCookie = cookies.find(c => c.startsWith(`${stickyConfig.cookieName}=`));
            if (stickyCookie) {
                stickyBackendId = stickyCookie.split('=')[1];
            }
        }
    }

    // Check if sticky backend is valid and healthy
    if (stickyBackendId) {
        const stickyBackend = backends.find(b => b.id === stickyBackendId);
        if (stickyBackend) {
            const health = healthCache.get(stickyBackendId);
            if (!health || health.healthy) {
                return { backend: stickyBackend, isSticky: true };
            }
        }
    }

    // Fallback to weighted selection
    return { backend: selectWeighted(backends), isSticky: false };
}

/**
 * Create sticky cookie header
 */
export function createStickyCookie(
    backendId: string,
    stickyConfig: StickyConfig,
    secure: boolean = true
): string {
    const parts = [
        `${stickyConfig.cookieName}=${backendId}`,
        `Max-Age=${stickyConfig.ttlSeconds}`,
        'Path=/',
        'SameSite=Lax',
    ];

    if (secure) {
        parts.push('Secure');
    }

    return parts.join('; ');
}

/**
 * Main entry point: select a backend based on strategy
 */
export function selectBackend(
    backends: Backend[],
    strategy: LoadBalancerStrategy,
    policyId: string,
    features: RequestFeatures,
    request: Request,
    stickyConfig?: StickyConfig
): LoadBalancerResult {
    // Filter to only enabled backends
    const enabledBackends = backends.filter(b => b.enabled);

    if (enabledBackends.length === 0) {
        throw new Error('No enabled backends available');
    }

    // For health-aware strategies, filter to healthy backends
    let candidates = enabledBackends;
    if (strategy === 'health-aware' || strategy === 'latency-aware') {
        const healthy = filterHealthyBackends(enabledBackends);
        if (healthy.length > 0) {
            candidates = healthy;
        }
        // If all unhealthy, use all enabled (fail open)
    }

    let selectedBackend: Backend;
    let selectionReason: string;
    let latencyEstimate: number | undefined;

    switch (strategy) {
        case 'weighted-round-robin':
            selectedBackend = selectRoundRobin(candidates, policyId);
            selectionReason = 'Weighted round-robin selection';
            break;

        case 'latency-aware':
            selectedBackend = selectLatencyAware(candidates);
            latencyEstimate = healthCache.get(selectedBackend.id)?.latencyP95;
            selectionReason = latencyEstimate
                ? `Latency-aware selection (p95: ${latencyEstimate}ms)`
                : 'Latency-aware selection (no metrics)';
            break;

        case 'health-aware':
            selectedBackend = selectWeighted(candidates);
            selectionReason = 'Health-aware weighted selection';
            break;

        case 'sticky':
            if (stickyConfig) {
                const result = selectSticky(candidates, features, stickyConfig, request);
                selectedBackend = result.backend;
                selectionReason = result.isSticky
                    ? 'Sticky session (existing)'
                    : 'Sticky session (new assignment)';
            } else {
                selectedBackend = selectWeighted(candidates);
                selectionReason = 'Sticky fallback (no config)';
            }
            break;

        case 'random':
            selectedBackend = candidates[Math.floor(Math.random() * candidates.length)];
            selectionReason = 'Random selection';
            break;

        default:
            selectedBackend = selectWeighted(candidates);
            selectionReason = 'Default weighted selection';
    }

    return {
        backend: selectedBackend,
        strategy,
        candidatesCount: candidates.length,
        selectionReason,
        latencyEstimate,
    };
}
