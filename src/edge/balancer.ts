import * as Sentry from '@sentry/nextjs';
import { extractFeatures } from './feature-extractor';
import { checkRateLimit, getRateLimitHeaders } from './rate-limiter';
import { selectBackend, createStickyCookie } from './route-selector';
import { makeDecision, extractToken, validateToken, createTokenCookie } from '@/bot-guard';
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
    trackAIClassifierPerformance,
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
    config: GlobalConfig,
    domain?: string
): Promise<Response> {
    const startTime = Date.now();
    const ipSalt = process.env.IP_HASH_SALT || 'default-salt';
    const challengeSecret = process.env.CHALLENGE_SECRET || 'default-secret';
    const sampleRate = config.telemetrySampleRate;
    const shouldEmitTelemetry = shouldSample(sampleRate);

    // Log URL for debugging
    console.log('[Balancer] request URL:', request.url);
    let pathname = '/unknown';
    let requestUrl: URL;
    try {
        requestUrl = new URL(request.url);
        pathname = requestUrl.pathname;
    } catch (e) {
        console.error('[Balancer] Invalid URL:', request.url, e);
        return new Response('Invalid URL', { status: 400 });
    }

    // Check for __challenge query param - handle challenge token setting
    const challengeToken = requestUrl.searchParams.get('__challenge');
    if (challengeToken) {
        try {
            // Extract features to get IP hash for validation
            const features = await extractFeatures(request, ipSalt);
            
            // Validate the challenge token
            const tokenResult = await validateToken(challengeToken, features.ipHash, challengeSecret);
            
            if (tokenResult.valid) {
                // Token is valid - set the challenge cookie and redirect to clean URL
                const isSecure = requestUrl.protocol === 'https:' || process.env.NODE_ENV === 'production';
                const cookie = createTokenCookie(challengeToken, isSecure);
                
                // Create clean URL without __challenge param
                const cleanUrl = new URL(request.url);
                cleanUrl.searchParams.delete('__challenge');
                
                // Redirect to clean URL with cookie set
                return new Response(null, {
                    status: 302,
                    headers: {
                        'Location': cleanUrl.toString(),
                        'Set-Cookie': cookie,
                    },
                });
            } else {
                // Invalid token - remove param and continue (will likely get challenged again)
                console.warn('[Balancer] Invalid challenge token:', tokenResult.reason);
                const cleanUrl = new URL(request.url);
                cleanUrl.searchParams.delete('__challenge');
                return new Response(null, {
                    status: 302,
                    headers: {
                        'Location': cleanUrl.toString(),
                    },
                });
            }
        } catch (error) {
            console.error('[Balancer] Error processing __challenge param:', error);
            // On error, remove param and continue
            const cleanUrl = new URL(request.url);
            cleanUrl.searchParams.delete('__challenge');
            return new Response(null, {
                status: 302,
                headers: {
                    'Location': cleanUrl.toString(),
                },
            });
        }
    }

    // Start Sentry transaction with full request journey
    return Sentry.startSpan(
        {
            name: `Request Journey: ${request.method} ${pathname}`,
            op: 'http.server',
            attributes: {
                'http.method': request.method,
                'http.url': pathname,
                'http.route': pathname,
            },
        },
        async (span) => {
            // Add initial breadcrumb for request start
            // Note: requestId will be generated in extractFeatures
            addDecisionBreadcrumb('request.start', 'Request received', {
                method: request.method,
                path: pathname,
            });
            let features: RequestFeatures;
            let decision: DecisionAction = 'allow';
            let policyVersion = config.version;
            let backendId: string | undefined;
            let botResult: BotScoringResult | undefined;

            try {
                // 1. Extract features - Step 1 in request journey
                Sentry.addBreadcrumb({ 
                    category: 'request.journey', 
                    message: 'Step 1: Extracting request features',
                    level: 'info',
                    data: { step: 1, stage: 'feature_extraction' }
                });
                features = await withSpanAsync(
                    SpanOps.FEATURE_EXTRACT,
                    'Extract request features',
                    () => extractFeatures(request, ipSalt)
                );
                
                // Add feature context to span
                const featureSpan = Sentry.getActiveSpan();
                if (featureSpan) {
                    featureSpan.setAttribute('features.ip_hash', features.ipHash);
                    featureSpan.setAttribute('features.user_agent_length', features.userAgent.length);
                    featureSpan.setAttribute('features.has_cookies', features.hasCookies);
                    featureSpan.setAttribute('features.country', features.country || 'unknown');
                }
                
                Sentry.addBreadcrumb({
                    category: 'request.journey',
                    message: 'Features extracted',
                    level: 'info',
                    data: {
                        step: 1,
                        stage: 'feature_extraction_complete',
                        ipHash: features.ipHash.substring(0, 8),
                        uaLength: features.userAgent.length,
                        hasCookies: features.hasCookies,
                        country: features.country
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
                
                // Default stickyConfig if strategy is sticky but config is missing
                const stickyConfig = policy?.stickyConfig ?? (strategy === 'sticky' ? {
                    type: 'cookie' as const,
                    cookieName: '_lb_sticky',
                    headerName: 'X-Sticky-Backend',
                    ttlSeconds: 3600,
                } : undefined);

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

                // 4. Rate limiting - Step 2 in request journey
                Sentry.addBreadcrumb({ 
                    category: 'request.journey', 
                    message: 'Step 2: Checking rate limits',
                    level: 'info',
                    data: { step: 2, stage: 'rate_limiting', key_type: rateConfig.keyType }
                });
                const rateResult = await withSpanAsync(
                    SpanOps.RATE_LIMIT,
                    'Check rate limits',
                    () => checkRateLimit(features, rateConfig, policy?.id ?? 'default')
                );

                setRateLimitContext(rateResult.keyType, rateResult.allowed, rateResult.remaining);
                
                // Add rate limit decision to span
                const rateSpan = Sentry.getActiveSpan();
                if (rateSpan) {
                    rateSpan.setAttribute('ratelimit.allowed', rateResult.allowed);
                    rateSpan.setAttribute('ratelimit.remaining', rateResult.remaining);
                    rateSpan.setAttribute('ratelimit.key_type', rateResult.keyType);
                    if (rateResult.retryAfterMs) {
                        rateSpan.setAttribute('ratelimit.retry_after_ms', rateResult.retryAfterMs);
                    }
                }

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
                        domain,
                    }, request.url);

                    return createThrottleResponse(
                        features.requestId,
                        Math.ceil((rateResult.retryAfterMs ?? 60000) / 1000),
                        rateResult.remaining,
                        rateResult.resetAt
                    );
                }

                // 5. Bot detection - Step 3 in request journey
                if (isValidatedHuman) {
                    Sentry.addBreadcrumb({ 
                        category: 'request.journey', 
                        message: 'Step 3: Bot detection (challenge token validated)',
                        level: 'info',
                        data: { step: 3, stage: 'bot_detection', bypass: 'challenge_token' }
                    });
                    botResult = {
                        score: 0,
                        bucket: 'low',
                        decision: 'allow',
                        reasons: [{ rule: 'challenge_token', weight: 0, triggered: true, explanation: 'Valid challenge token' }]
                    };
                } else {
                    Sentry.addBreadcrumb({ 
                        category: 'request.journey', 
                        message: 'Step 3: Evaluating bot score',
                        level: 'info',
                        data: { 
                            step: 3, 
                            stage: 'bot_detection',
                            heuristics_enabled: true,
                            ai_enabled: botConfig.useAiClassifier 
                        }
                    });
                    const aiConfig = process.env.AI_CLASSIFIER_URL ? {
                        url: process.env.AI_CLASSIFIER_URL,
                        apiKey: process.env.AI_CLASSIFIER_API_KEY || '',
                        timeoutMs: parseInt(process.env.AI_CLASSIFIER_TIMEOUT_MS || '50', 10),
                    } : undefined;

                    botResult = await withSpanAsync(
                        SpanOps.BOT_HEURISTICS,
                        'Evaluate bot score (heuristics + AI)',
                        () => makeDecision(features, botConfig, {
                            ipAllowlist: policy?.ipAllowlist,
                            ipBlocklist: policy?.ipBlocklist,
                            aiConfig: botConfig.useAiClassifier ? aiConfig : undefined,
                        })
                    );
                }

                Sentry.addBreadcrumb({
                    category: 'request.journey',
                    message: 'Bot score calculated',
                    level: 'info',
                    data: { 
                        step: 3, 
                        stage: 'bot_detection_complete',
                        score: botResult.score,
                        bucket: botResult.bucket,
                        decision: botResult.decision,
                        ai_used: !!botResult.aiResult,
                        ai_score: botResult.aiResult?.probability
                    }
                });

                setBotContext(botResult);

                if (shouldEmitTelemetry) {
                    recordBotScore(botResult.score, features.path);
                    
                    // Track AI classifier performance if AI was used
                    if (botResult.aiResult) {
                        // Extract heuristic score from reasons (approximate)
                        const heuristicScore = botResult.reasons.reduce((sum, r) => sum + (r.triggered ? r.weight : 0), 0) / 100;
                        trackAIClassifierPerformance(
                            heuristicScore,
                            botResult.aiResult.probability,
                            botResult.score,
                            botResult.decision,
                            features.path
                        );
                    }
                }

                // Handle bot decision
                if (botResult.decision !== 'allow') {
                    // Get top triggered reason for metrics
                    const topTriggeredReason = botResult.reasons
                        .filter(r => r.triggered)
                        .sort((a, b) => b.weight - a.weight)[0]?.rule;
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
                                botReason: topTriggeredReason,
                                statusCode: 403,
                                domain,
                            }, request.url);
                            return createBlockResponse(features.requestId);

                        case 'challenge':
                            // Use hardcoded challenge URL for cross-domain support
                            const challengeUrl = 'https://uottahack8.vercel.app/challenge';
                            const originalUrl = request.url; // Full original URL including domain and path

                            console.log('[Balancer] Creating challenge response. Original URL:', originalUrl);

                            recordMetric({
                                requestId: features.requestId,
                                decision,
                                path: features.path,
                                method: features.method,
                                latencyMs: latency,
                                botScore: botResult.score,
                                botBucket: botResult.bucket,
                                botReason: topTriggeredReason,
                                statusCode: 302,
                                domain,
                            }, request.url);

                            return createChallengeResponse(
                                features.requestId,
                                challengeUrl,
                                originalUrl
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
                                botReason: topTriggeredReason,
                                statusCode: 429,
                                domain,
                            }, request.url);
                            return createThrottleResponse(features.requestId, 30, 0);

                        case 'reroute':
                            console.log('[Balancer] Rerouting request');
                            // Will handle in backend selection
                            break;
                    }
                }

                // 6. Select backend - Step 4 in request journey
                const selectedBackends = decision === 'reroute' && botConfig.rerouteBackendId
                    ? backends.filter(b => b.id === botConfig.rerouteBackendId)
                    : backends;

                Sentry.addBreadcrumb({ 
                    category: 'request.journey', 
                    message: 'Step 4: Selecting backend',
                    level: 'info',
                    data: { step: 4, stage: 'route_selection', strategy, candidates: selectedBackends.length }
                });

                const lbResult = await withSpanAsync(
                    SpanOps.ROUTE_SELECT,
                    'Select backend',
                    async () => selectBackend(
                        selectedBackends.length > 0 ? selectedBackends : backends,
                        strategy,
                        policy?.id ?? 'default',
                        features,
                        request,
                        stickyConfig
                    )
                );

                setLoadBalancerContext(lbResult);
                backendId = lbResult.backend.id;

                Sentry.addBreadcrumb({
                    category: 'request.journey',
                    message: 'Backend selected',
                    level: 'info',
                    data: {
                        step: 4,
                        stage: 'route_selection_complete',
                        backend: lbResult.backend.id,
                        strategy: lbResult.strategy,
                        candidates: lbResult.candidatesCount,
                        selection_reason: lbResult.selectionReason
                    }
                });

                // 7. Proxy to backend - Step 5 in request journey
                Sentry.addBreadcrumb({ 
                    category: 'request.journey', 
                    message: 'Step 5: Proxying request to backend',
                    level: 'info',
                    data: { step: 5, stage: 'proxy', backend: lbResult.backend.id }
                });
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

                if (strategy === 'sticky' && stickyConfig) {
                    // Determine if request is secure (HTTPS)
                    const isSecure = new URL(request.url).protocol === 'https:';
                    responseHeaders.append(
                        'Set-Cookie',
                        createStickyCookie(lbResult.backend.id, stickyConfig, isSecure)
                    );
                }

                // Add rate limit headers
                const rateLimitHeaders = getRateLimitHeaders(rateResult);
                for (const [key, value] of Object.entries(rateLimitHeaders)) {
                    responseHeaders.set(key, value);
                }

                // Record metric for successful request
                const totalLatency = Date.now() - startTime;
                // Get top triggered reason if bot detection ran
                const topTriggeredReasonForAllow = botResult?.reasons
                    .filter(r => r.triggered)
                    .sort((a, b) => b.weight - a.weight)[0]?.rule;
                
                recordMetric({
                    requestId: features.requestId,
                    decision,
                    path: features.path,
                    method: features.method,
                    backendId: lbResult.backend.id,
                    latencyMs: totalLatency,
                    botScore: botResult?.score,
                    botBucket: botResult?.bucket,
                    botReason: topTriggeredReasonForAllow,
                    statusCode: response.status,
                    domain,
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
        botReason?: string; // Top triggered reason
        statusCode?: number;
        domain?: string;
    },
    baseUrl?: string
): void {
    // Get API key from environment
    const apiKey = process.env.METRICS_API_KEY;
    if (!apiKey) {
        // Silently skip if no API key configured
        return;
    }

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
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
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
            botReason: data.botReason,
            statusCode: data.statusCode,
            domain: data.domain,
        }),
    }).catch((error) => {
        // Silently fail - metrics recording shouldn't break requests
        console.error('[Balancer] Failed to record metric:', error);
    });
}
