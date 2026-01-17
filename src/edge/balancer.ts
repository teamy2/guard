import * as Sentry from '@sentry/nextjs';
import { extractFeatures } from './feature-extractor';
import { checkRateLimit, getRateLimitHeaders } from './rate-limiter';
import { selectBackend, createStickyCookie } from './route-selector';
import { makeDecision, extractToken, validateToken } from '@/bot-guard';
import {
    proxyRequest,
    createBlockResponse,
    createThrottleResponse,
    createChallengeResponse,
    createStandardHeaders,
} from './proxy';
import {
    SpanOps,
    setStandardTags,
    setBotContext,
    setLoadBalancerContext,
    setRateLimitContext,
    addDecisionBreadcrumb,
    incrementRequestCounter,
    incrementBotActionCounter,
    incrementRateLimitCounter,
    recordBotScore,
    recordBackendLatency,
    captureBotGuardException,
    captureBackendException,
    shouldSample,
    withSpanAsync,
} from '@/sentry/instrumentation';
import type {
    GlobalConfig,
    RoutePolicy,
    RequestFeatures,
    DecisionAction,
    BotScoringResult,
} from '@/config/schema';

/**
 * Result of policy matching
 */
interface PolicyMatch {
    policy: RoutePolicy;
    matchedPath: boolean;
}

/**
 * Match request against policies to find applicable policy
 */
function matchPolicy(
    path: string,
    method: string,
    config: GlobalConfig
): PolicyMatch | null {
    // Sort policies by priority (descending)
    const sortedPolicies = [...config.policies]
        .filter(p => p.enabled)
        .sort((a, b) => b.priority - a.priority);

    for (const policy of sortedPolicies) {
        // Check method if specified
        if (policy.methods && !policy.methods.includes(method)) {
            continue;
        }

        // Check path pattern (simple glob matching)
        if (matchPath(path, policy.pathPattern)) {
            return { policy, matchedPath: true };
        }
    }

    return null;
}

/**
 * Simple glob pattern matching
 */
function matchPath(path: string, pattern: string): boolean {
    // Handle exact match
    if (pattern === path) return true;

    // Handle wildcards
    if (pattern === '/**' || pattern === '/*') return true;

    // Convert glob to regex
    const regexPattern = pattern
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*')
        .replace(/\//g, '\\/');

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(path);
}

/**
 * Main balancer handler - processes a request through the full pipeline
 */
export async function handleRequest(
    request: Request,
    config: GlobalConfig
): Promise<Response> {
    const startTime = Date.now();
    const ipSalt = process.env.IP_HASH_SALT || 'default-salt';
    const challengeSecret = process.env.CHALLENGE_SECRET || 'default-secret';
    const sampleRate = config.telemetrySampleRate;
    const shouldEmitTelemetry = shouldSample(sampleRate);

    // Log URL for debugging
    console.log('[Balancer] request URL:', request.url);
    let pathname = '/unknown';
    try {
        pathname = new URL(request.url).pathname;
    } catch (e) {
        console.error('[Balancer] Invalid URL:', request.url, e);
    }

    // Start Sentry transaction
    return Sentry.startSpan(
        {
            name: `edge.balancer ${request.method} ${pathname}`,
            op: 'http.server',
        },
        async (span) => {
            let features: RequestFeatures;
            let decision: DecisionAction = 'allow';
            let policyVersion = config.version;
            let backendId: string | undefined;

            try {
                // 1. Extract features
                Sentry.addBreadcrumb({ category: 'debug', message: 'Extracting features...' });
                features = await withSpanAsync(
                    SpanOps.FEATURE_EXTRACT,
                    'Extract request features',
                    () => extractFeatures(request, ipSalt)
                );
                Sentry.addBreadcrumb({
                    category: 'debug',
                    message: 'Features extracted',
                    data: {
                        ipHash: features.ipHash.substring(0, 8),
                        uaLength: features.userAgent.length
                    }
                });

                // 2. Match policy
                const policyMatch = matchPolicy(features.path, features.method, config);

                if (!policyMatch) {
                    // No matching policy - use defaults
                    addDecisionBreadcrumb('policy', 'No matching policy, using defaults', {
                        path: features.path,
                    });
                }

                const policy = policyMatch?.policy;
                const rateConfig = policy?.rateLimit ?? config.defaultRateLimit;
                const botConfig = policy?.botGuard ?? config.defaultBotGuard;
                const strategy = policy?.strategy ?? config.defaultStrategy;
                const backendIds = policy?.backendIds ?? config.backends.map(b => b.id);

                // Get backends for this policy
                const backends = config.backends.filter(b => backendIds.includes(b.id));

                if (backends.length === 0) {
                    throw new Error('No backends available for policy');
                }

                // 3. Check for valid challenge token (skip further checks if valid)
                const existingToken = extractToken(request);
                let isValidatedHuman = false;
                if (existingToken) {
                    const tokenResult = await validateToken(existingToken, features.ipHash, challengeSecret);
                    if (tokenResult.valid) {
                        addDecisionBreadcrumb('challenge', 'Valid challenge token', {});
                        isValidatedHuman = true;
                    }
                }

                // 4. Rate limiting
                Sentry.addBreadcrumb({ category: 'debug', message: 'Checking rate limit...' });
                const rateResult = await withSpanAsync(
                    SpanOps.RATE_LIMIT,
                    'Check rate limits',
                    () => checkRateLimit(features, rateConfig, policy?.id ?? 'default')
                );

                setRateLimitContext(rateResult.keyType, rateResult.allowed, rateResult.remaining);

                if (!rateResult.allowed) {
                    decision = 'throttle';
                    addDecisionBreadcrumb('ratelimit', 'Rate limit exceeded', {
                        remaining: rateResult.remaining,
                        key: rateResult.keyType,
                    });

                    if (shouldEmitTelemetry) {
                        incrementRateLimitCounter(features.path);
                        incrementRequestCounter(decision, features.path, undefined);
                    }

                    setStandardTags(decision, features.path, policyVersion);

                    const latency = Date.now() - startTime;
                    recordMetric({
                        requestId: features.requestId,
                        decision,
                        path: features.path,
                        method: features.method,
                        latencyMs: latency,
                        statusCode: 429,
                    }, request.url);

                    return createThrottleResponse(
                        features.requestId,
                        Math.ceil((rateResult.retryAfterMs ?? 60000) / 1000),
                        rateResult.remaining,
                        rateResult.resetAt
                    );
                }

                // 5. Bot detection
                let botResult: BotScoringResult;
                if (isValidatedHuman) {
                    botResult = {
                        score: 0,
                        bucket: 'low',
                        decision: 'allow',
                        reasons: [{ rule: 'challenge_token', weight: 0, triggered: true, explanation: 'Valid challenge token' }]
                    };
                } else {
                    Sentry.addBreadcrumb({ category: 'debug', message: 'Evaluating bot score...' });
                    const aiConfig = process.env.AI_CLASSIFIER_URL ? {
                        url: process.env.AI_CLASSIFIER_URL,
                        apiKey: process.env.AI_CLASSIFIER_API_KEY || '',
                        timeoutMs: parseInt(process.env.AI_CLASSIFIER_TIMEOUT_MS || '50', 10),
                    } : undefined;

                    botResult = await withSpanAsync(
                        SpanOps.BOT_HEURISTICS,
                        'Evaluate bot score',
                        () => makeDecision(features, botConfig, {
                            ipAllowlist: policy?.ipAllowlist,
                            ipBlocklist: policy?.ipBlocklist,
                            aiConfig: botConfig.useAiClassifier ? aiConfig : undefined,
                        })
                    );
                }

                Sentry.addBreadcrumb({
                    category: 'debug',
                    message: 'Bot score calculated',
                    data: { score: botResult.score }
                });

                setBotContext(botResult);

                if (shouldEmitTelemetry) {
                    recordBotScore(botResult.score, features.path);
                }

                // Handle bot decision
                if (botResult.decision !== 'allow') {
                    console.log('!!! BOT DETECTED !!!', {
                        action: botResult.decision,
                        score: botResult.score,
                        reasons: botResult.reasons.filter(r => r.triggered).map(r => r.rule),
                        bucket: botResult.bucket
                    });

                    decision = botResult.decision;
                    addDecisionBreadcrumb('bot', `Bot decision: ${decision}`, {
                        score: botResult.score,
                        bucket: botResult.bucket,
                        reasons: botResult.reasons.filter(r => r.triggered).map(r => r.rule),
                    });

                    if (shouldEmitTelemetry) {
                        incrementBotActionCounter(decision, features.path);
                        incrementRequestCounter(decision, features.path, undefined);
                    }

                    setStandardTags(decision, features.path, policyVersion, undefined, botResult.bucket);

                    console.log('[Balancer] Executing decision action:', decision);
                    const latency = Date.now() - startTime;
                    
                    switch (decision) {
                        case 'block':
                            console.log('[Balancer] Creating block response');
                            recordMetric({
                                requestId: features.requestId,
                                decision,
                                path: features.path,
                                method: features.method,
                                latencyMs: latency,
                                botScore: botResult.score,
                                botBucket: botResult.bucket,
                                statusCode: 403,
                            }, request.url);
                            return createBlockResponse(features.requestId);

                        case 'challenge':
                            // Use absolute URL for redirect to avoid "Invalid URL" errors in some runtimes
                            const protocol = features.protocol || 'https';
                            const host = features.host;
                            const absoluteChallengeUrl = `${protocol}://${host}${config.challengePageUrl}`;

                            console.log('[Balancer] Creating challenge response. Absolute URL:', absoluteChallengeUrl);

                            recordMetric({
                                requestId: features.requestId,
                                decision,
                                path: features.path,
                                method: features.method,
                                latencyMs: latency,
                                botScore: botResult.score,
                                botBucket: botResult.bucket,
                                statusCode: 302,
                            }, request.url);

                            return createChallengeResponse(
                                features.requestId,
                                absoluteChallengeUrl,
                                features.path
                            );

                        case 'throttle':
                            console.log('[Balancer] Creating throttle response');
                            recordMetric({
                                requestId: features.requestId,
                                decision,
                                path: features.path,
                                method: features.method,
                                latencyMs: latency,
                                botScore: botResult.score,
                                botBucket: botResult.bucket,
                                statusCode: 429,
                            }, request.url);
                            return createThrottleResponse(features.requestId, 30, 0);

                        case 'reroute':
                            console.log('[Balancer] Rerouting request');
                            // Will handle in backend selection
                            break;
                    }
                }

                // 6. Select backend
                const selectedBackends = decision === 'reroute' && botConfig.rerouteBackendId
                    ? backends.filter(b => b.id === botConfig.rerouteBackendId)
                    : backends;

                const lbResult = await withSpanAsync(
                    SpanOps.ROUTE_SELECT,
                    'Select backend',
                    async () => selectBackend(
                        selectedBackends.length > 0 ? selectedBackends : backends,
                        strategy,
                        policy?.id ?? 'default',
                        features,
                        request,
                        policy?.stickyConfig
                    )
                );

                setLoadBalancerContext(lbResult);
                backendId = lbResult.backend.id;

                addDecisionBreadcrumb('backend', `Selected backend: ${lbResult.backend.id}`, {
                    strategy: lbResult.strategy,
                    candidates: lbResult.candidatesCount,
                });

                // 7. Proxy to backend
                const proxyStartTime = Date.now();

                const response = await withSpanAsync(
                    SpanOps.PROXY,
                    `Proxy to ${lbResult.backend.id}`,
                    () => proxyRequest(
                        request,
                        lbResult.backend,
                        createStandardHeaders(features.requestId, features.traceId)
                    )
                );

                const proxyLatency = Date.now() - proxyStartTime;

                if (shouldEmitTelemetry) {
                    recordBackendLatency(proxyLatency, lbResult.backend.id, features.path);
                }

                // Handle backend errors
                if (response.status >= 500) {
                    captureBackendException(
                        new Error(`Backend error: ${response.status}`),
                        lbResult.backend.id,
                        response.status,
                        lbResult
                    );
                }

                // 8. Build final response
                decision = 'allow';

                if (shouldEmitTelemetry) {
                    incrementRequestCounter(decision, features.path, lbResult.backend.id);
                }

                setStandardTags(decision, features.path, policyVersion, lbResult.backend.id);

                // Add sticky cookie if needed
                const responseHeaders = new Headers(response.headers);
                if (strategy === 'sticky' && policy?.stickyConfig) {
                    responseHeaders.append(
                        'Set-Cookie',
                        createStickyCookie(lbResult.backend.id, policy.stickyConfig)
                    );
                }

                // Add rate limit headers
                const rateLimitHeaders = getRateLimitHeaders(rateResult);
                for (const [key, value] of Object.entries(rateLimitHeaders)) {
                    responseHeaders.set(key, value);
                }

                // Record metric for successful request
                const totalLatency = Date.now() - startTime;
                recordMetric({
                    requestId: features.requestId,
                    decision,
                    path: features.path,
                    method: features.method,
                    backendId: lbResult.backend.id,
                    latencyMs: totalLatency,
                    statusCode: response.status,
                }, request.url);

                return new Response(response.body, {
                    status: response.status,
                    statusText: response.statusText,
                    headers: responseHeaders,
                });

            } catch (error) {
                // Handle unexpected errors
                const err = error instanceof Error ? error : new Error(String(error));

                Sentry.captureException(err);
                await Sentry.flush(2000);

                return new Response(
                    JSON.stringify({
                        error: 'Internal Server Error',
                        message: 'An unexpected error occurred',
                    }),
                    {
                        status: 500,
                        headers: { 'Content-Type': 'application/json' },
                    }
                );
            }
        }
    );
}

/**
 * Record request metric asynchronously (fire and forget)
 */
function recordMetric(
    data: {
        requestId: string;
        decision: DecisionAction;
        path?: string;
        method?: string;
        backendId?: string;
        latencyMs: number;
        botScore?: number;
        botBucket?: 'low' | 'medium' | 'high';
        statusCode?: number;
    },
    baseUrl?: string
): void {
    // Construct absolute URL for metrics endpoint
    let metricsUrl = '/api/metrics/record';
    if (baseUrl) {
        try {
            const url = new URL(baseUrl);
            metricsUrl = `${url.protocol}//${url.host}/api/metrics/record`;
        } catch {
            // Fallback to relative URL if parsing fails
        }
    }

    // Fire and forget - don't block response
    fetch(metricsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            requestId: data.requestId,
            timestamp: new Date().toISOString(),
            decision: data.decision,
            path: data.path,
            method: data.method,
            backendId: data.backendId,
            latencyMs: data.latencyMs,
            botScore: data.botScore,
            botBucket: data.botBucket,
            statusCode: data.statusCode,
        }),
    }).catch((error) => {
        // Silently fail - metrics recording shouldn't break requests
        console.error('[Balancer] Failed to record metric:', error);
    });
}

/**
 * Check if path should be excluded from load balancer
 */
export function shouldExcludePath(path: string): boolean {
    const excludedPatterns = [
        /^\/_next\//,           // Next.js internal
        /^\/api\/health$/,      // Health check
        /^\/favicon\.ico$/,     // Favicon
        /^\/robots\.txt$/,      // Robots
        /^\/internal/,          // Admin routes
        /^\/challenge/,         // Challenge page
    ];

    return excludedPatterns.some(pattern => pattern.test(path));
}
