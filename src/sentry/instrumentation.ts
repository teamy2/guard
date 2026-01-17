import * as Sentry from '@sentry/nextjs';
import type { RequestFeatures, BotScoringResult, LoadBalancerResult, DecisionAction } from '@/config/schema';

/**
 * Span operation names for consistent instrumentation
 */
export const SpanOps = {
    FEATURE_EXTRACT: 'edge.feature_extract',
    RATE_LIMIT: 'edge.rate_limit',
    BOT_HEURISTICS: 'edge.bot_heuristics',
    BOT_AI: 'edge.bot_ai',
    ROUTE_SELECT: 'edge.route_select',
    PROXY: 'edge.proxy',
    RESPONSE_BUILD: 'edge.response_build',
} as const;

/**
 * Standard tag names
 */
export const Tags = {
    ROUTE: 'route',
    POLICY_VERSION: 'policy_version',
    BACKEND: 'backend',
    DECISION: 'decision',
    BOT_BUCKET: 'bot_bucket',
    REGION: 'region',
    RUNTIME: 'runtime',
} as const;

/**
 * Create a transaction for an edge request
 */
export function startEdgeTransaction(
    method: string,
    route: string,
    traceId: string
): ReturnType<typeof Sentry.startSpan> | undefined {
    return Sentry.startSpan(
        {
            name: `edge.balancer ${method} ${route}`,
            op: 'http.server',
            attributes: {
                [Tags.RUNTIME]: 'edge',
                'http.method': method,
                'http.route': route,
            },
        },
        (span) => span
    );
}

/**
 * Create a child span for a specific operation
 */
export function withSpan<T>(
    op: string,
    description: string,
    fn: () => T
): T {
    return Sentry.startSpan(
        {
            name: description,
            op,
        },
        () => fn()
    );
}

/**
 * Create an async child span
 */
export async function withSpanAsync<T>(
    op: string,
    description: string,
    fn: () => Promise<T>
): Promise<T> {
    return Sentry.startSpan(
        {
            name: description,
            op,
        },
        async () => fn()
    );
}

/**
 * Add breadcrumb for major decisions
 */
export function addDecisionBreadcrumb(
    category: string,
    message: string,
    data?: Record<string, unknown>
): void {
    Sentry.addBreadcrumb({
        category,
        message,
        data,
        level: 'info',
        timestamp: Date.now() / 1000,
    });
}

/**
 * Set standard tags on current scope
 */
export function setStandardTags(
    decision: DecisionAction,
    route: string,
    policyVersion: string,
    backend?: string,
    botBucket?: 'low' | 'medium' | 'high',
    region?: string
): void {
    Sentry.setTag(Tags.DECISION, decision);
    Sentry.setTag(Tags.ROUTE, route);
    Sentry.setTag(Tags.POLICY_VERSION, policyVersion);
    Sentry.setTag(Tags.RUNTIME, 'edge');

    if (backend) {
        Sentry.setTag(Tags.BACKEND, backend);
    }
    if (botBucket) {
        Sentry.setTag(Tags.BOT_BUCKET, botBucket);
    }
    if (region) {
        Sentry.setTag(Tags.REGION, region);
    }
}

/**
 * Set context for bot scoring
 */
export function setBotContext(result: BotScoringResult): void {
    Sentry.setContext('bot', {
        score: result.score,
        bucket: result.bucket,
        decision: result.decision,
        reasons: result.reasons.filter(r => r.triggered).map(r => r.rule),
        ai_probability: result.aiResult?.probability,
        ai_categories: result.aiResult?.categories,
    });
}

/**
 * Set context for load balancing
 */
export function setLoadBalancerContext(result: LoadBalancerResult): void {
    Sentry.setContext('loadbalancer', {
        strategy: result.strategy,
        backend: result.backend.id,
        candidates_count: result.candidatesCount,
        selection_reason: result.selectionReason,
        latency_estimate: result.latencyEstimate,
    });
}

/**
 * Set context for rate limiting
 */
export function setRateLimitContext(
    keyType: string,
    allowed: boolean,
    remaining: number
): void {
    Sentry.setContext('ratelimit', {
        key_type: keyType,
        allowed,
        remaining,
    });
}

/**
 * Log a structured record with trace correlation
 */
export function logStructured(
    level: 'debug' | 'info' | 'warning' | 'error',
    message: string,
    data: Record<string, unknown>
): void {
    const traceId = Sentry.getActiveSpan()?.spanContext().traceId;

    // For now, use console with structured data
    // In production, this could go to a log aggregator
    const logData = {
        level,
        message,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
        ...data,
    };

    switch (level) {
        case 'debug':
            console.debug(JSON.stringify(logData));
            break;
        case 'info':
            console.info(JSON.stringify(logData));
            break;
        case 'warning':
            console.warn(JSON.stringify(logData));
            break;
        case 'error':
            console.error(JSON.stringify(logData));
            break;
    }
}

// ===========================================
// METRICS
// ===========================================

/**
 * Increment request counter
 * Note: Sentry SDK v10 changed metrics API - using setMeasurement instead
 */
export function incrementRequestCounter(
    decision: DecisionAction,
    route: string,
    backend?: string
): void {
    // Use span measurements for metrics in SDK v10+
    const span = Sentry.getActiveSpan();
    if (span) {
        span.setAttribute('lb.decision', decision);
        span.setAttribute('lb.route', normalizeRoute(route));
        if (backend) {
            span.setAttribute('lb.backend', backend);
        }
    }

    // Also log for aggregation
    logStructured('info', 'request_processed', {
        decision,
        route: normalizeRoute(route),
        backend: backend ?? 'none',
    });
}

/**
 * Increment bot action counter
 */
export function incrementBotActionCounter(
    action: DecisionAction,
    route: string
): void {
    const span = Sentry.getActiveSpan();
    if (span) {
        span.setAttribute('bot.action', action);
    }

    logStructured('info', 'bot_action', {
        action,
        route: normalizeRoute(route),
    });
}

/**
 * Increment rate limit counter
 */
export function incrementRateLimitCounter(route: string): void {
    const span = Sentry.getActiveSpan();
    if (span) {
        span.setAttribute('ratelimit.triggered', true);
    }

    logStructured('warning', 'rate_limited', {
        route: normalizeRoute(route),
    });
}

/**
 * Record bot score distribution
 */
export function recordBotScore(score: number, route: string): void {
    const span = Sentry.getActiveSpan();
    if (span) {
        span.setAttribute('bot.score', score);
    }
}

/**
 * Record backend latency
 */
export function recordBackendLatency(
    latencyMs: number,
    backend: string,
    route: string
): void {
    const span = Sentry.getActiveSpan();
    if (span) {
        span.setAttribute('backend.latency_ms', latencyMs);
        span.setAttribute('lb.backend', backend);
    }
}

/**
 * Set backend health gauge
 */
export function setBackendHealthGauge(backend: string, healthy: boolean): void {
    // Log for aggregation in SDK v10
    logStructured('info', 'backend_health', {
        backend,
        healthy,
    });
}

/**
 * Normalize route for low cardinality tags
 * Replace dynamic segments with placeholders
 */
function normalizeRoute(path: string): string {
    // Replace UUID-like segments
    let normalized = path.replace(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
        ':id'
    );

    // Replace numeric segments
    normalized = normalized.replace(/\/\d+/g, '/:id');

    // Limit length
    if (normalized.length > 50) {
        normalized = normalized.substring(0, 50) + '...';
    }

    return normalized;
}

// ===========================================
// ERROR HANDLING
// ===========================================

/**
 * Capture exception with bot guard context
 */
export function captureBotGuardException(
    error: Error,
    features: RequestFeatures,
    result?: BotScoringResult
): void {
    Sentry.withScope((scope) => {
        scope.setTag('module', 'bot-guard');
        scope.setContext('request_features', {
            ip_hash: features.ipHash,
            path: features.path,
            method: features.method,
            user_agent_length: features.userAgent.length,
        });

        if (result) {
            scope.setContext('bot_result', {
                score: result.score,
                bucket: result.bucket,
                reasons: result.reasons.filter(r => r.triggered).map(r => r.rule),
            });
        }

        // Fingerprint by module + error message
        scope.setFingerprint(['bot-guard', error.message]);

        Sentry.captureException(error);
    });
}

/**
 * Capture exception with backend context
 */
export function captureBackendException(
    error: Error,
    backend: string,
    statusCode?: number,
    lbResult?: LoadBalancerResult
): void {
    Sentry.withScope((scope) => {
        scope.setTag('module', 'backend');
        scope.setTag('backend', backend);

        if (statusCode) {
            scope.setTag('status_code_family', `${Math.floor(statusCode / 100)}xx`);
        }

        if (lbResult) {
            scope.setContext('loadbalancer', {
                strategy: lbResult.strategy,
                candidates_count: lbResult.candidatesCount,
                selection_reason: lbResult.selectionReason,
            });
        }

        // Fingerprint by backend + status code family
        const fingerprint = statusCode
            ? ['backend', backend, `${Math.floor(statusCode / 100)}xx`]
            : ['backend', backend, 'error'];
        scope.setFingerprint(fingerprint);

        Sentry.captureException(error);
    });
}

/**
 * Check if request should be sampled for telemetry
 */
export function shouldSample(sampleRate: number): boolean {
    return Math.random() < sampleRate;
}
