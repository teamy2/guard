import { z } from 'zod';

// ===========================================
// BACKEND CONFIGURATION
// ===========================================

export const BackendSchema = z.object({
    id: z.string(),
    name: z.string(),
    url: z.string().url(),
    weight: z.number().min(0).max(100).default(1),
    healthEndpoint: z.string().default('/health'),
    regionAffinity: z.array(z.string()).optional(),
    enabled: z.boolean().default(true),
});

export type Backend = z.infer<typeof BackendSchema>;

// ===========================================
// RATE LIMIT CONFIGURATION
// ===========================================

export const RateLimitConfigSchema = z.object({
    enabled: z.boolean().default(true),
    windowMs: z.number().default(60000), // 1 minute
    maxRequests: z.number().default(100),
    keyType: z.enum(['ip', 'subnet', 'session', 'endpoint', 'composite']).default('ip'),
    subnetMask: z.number().min(8).max(32).default(24), // /24 for IPv4
    burstLimit: z.number().optional(), // Allow burst above limit
    retryAfterMs: z.number().default(60000),
});

export type RateLimitConfig = z.infer<typeof RateLimitConfigSchema>;

// ===========================================
// BOT GUARD CONFIGURATION
// ===========================================

export const BotThresholdsSchema = z.object({
    low: z.number().default(0.3),
    medium: z.number().default(0.6),
    high: z.number().default(0.85),
});

export const BotActionsSchema = z.object({
    low: z.enum(['allow', 'challenge', 'throttle', 'block', 'reroute']).default('allow'),
    medium: z.enum(['allow', 'challenge', 'throttle', 'block', 'reroute']).default('challenge'),
    high: z.enum(['allow', 'challenge', 'throttle', 'block', 'reroute']).default('block'),
});

export const BotGuardConfigSchema = z.object({
    enabled: z.boolean().default(true),
    thresholds: BotThresholdsSchema.default({ low: 0.3, medium: 0.6, high: 0.85 }),
    actions: BotActionsSchema.default({ low: 'allow', medium: 'challenge', high: 'block' }),
    useAiClassifier: z.boolean().default(false),
    aiTimeoutMs: z.number().default(50),
    rerouteBackendId: z.string().optional(), // Backend to send suspicious traffic
});

export type BotGuardConfig = z.infer<typeof BotGuardConfigSchema>;

// ===========================================
// LOAD BALANCER STRATEGY
// ===========================================

export const LoadBalancerStrategySchema = z.enum([
    'weighted-round-robin',
    'latency-aware',
    'health-aware',
    'sticky',
    'random',
]);

export type LoadBalancerStrategy = z.infer<typeof LoadBalancerStrategySchema>;

export const StickyConfigSchema = z.object({
    type: z.enum(['cookie', 'header']).default('cookie'),
    cookieName: z.string().default('_lb_sticky'),
    headerName: z.string().default('X-Sticky-Backend'),
    ttlSeconds: z.number().default(3600),
});

export type StickyConfig = z.infer<typeof StickyConfigSchema>;

// ===========================================
// ROUTE POLICY
// ===========================================

export const RoutePolicySchema = z.object({
    id: z.string(),
    name: z.string(),
    priority: z.number().default(0),

    // Matching
    pathPattern: z.string(), // Glob or regex
    methods: z.array(z.string()).optional(), // GET, POST, etc.
    tenantId: z.string().optional(),
    region: z.string().optional(),

    // Load balancing
    strategy: LoadBalancerStrategySchema.default('weighted-round-robin'),
    stickyConfig: StickyConfigSchema.optional(),
    backendIds: z.array(z.string()), // Allowed backends for this route

    // Rate limiting
    rateLimit: RateLimitConfigSchema.optional(),

    // Bot guard
    botGuard: BotGuardConfigSchema.optional(),

    // Allow/block lists
    ipAllowlist: z.array(z.string()).optional(),
    ipBlocklist: z.array(z.string()).optional(),

    enabled: z.boolean().default(true),
});

export type RoutePolicy = z.infer<typeof RoutePolicySchema>;

// ===========================================
// GLOBAL CONFIGURATION
// ===========================================

export const GlobalConfigSchema = z.object({
    version: z.string(),
    status: z.enum(['draft', 'active']).default('draft'),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),

    // Backends
    backends: z.array(BackendSchema),

    // Route policies (evaluated in priority order)
    policies: z.array(RoutePolicySchema),

    // Default settings
    defaultRateLimit: RateLimitConfigSchema.default({
        enabled: true,
        windowMs: 60000,
        maxRequests: 100,
        keyType: 'ip',
        subnetMask: 24,
        retryAfterMs: 60000,
    }),
    defaultBotGuard: BotGuardConfigSchema.default({
        enabled: true,
        thresholds: { low: 0.3, medium: 0.6, high: 0.85 },
        actions: { low: 'allow', medium: 'challenge', high: 'block' },
        useAiClassifier: false,
        aiTimeoutMs: 50,
    }),
    defaultStrategy: LoadBalancerStrategySchema.default('weighted-round-robin'),

    // Telemetry
    telemetrySampleRate: z.number().min(0).max(1).default(0.1),

    // Challenge page URL
    challengePageUrl: z.string().default('/challenge'),
});

export type GlobalConfig = z.infer<typeof GlobalConfigSchema>;

// ===========================================
// BACKEND HEALTH STATUS
// ===========================================

export const BackendHealthSchema = z.object({
    backendId: z.string(),
    healthy: z.boolean(),
    lastCheck: z.string().datetime(),
    latencyP50: z.number().optional(),
    latencyP95: z.number().optional(),
    latencyP99: z.number().optional(),
    errorRate: z.number().optional(),
    consecutiveFailures: z.number().default(0),
});

export type BackendHealth = z.infer<typeof BackendHealthSchema>;

// ===========================================
// REQUEST FEATURES (extracted at edge)
// ===========================================

export interface RequestFeatures {
    requestId: string;
    traceId: string;

    // Network
    ipHash: string; // Hashed IP for privacy
    subnet: string;

    // Geo
    country?: string;
    region?: string;
    city?: string;
    asn?: string;

    // Request
    method: string;
    path: string;
    host: string;
    protocol: string;

    // Headers (sanitized)
    userAgent: string;
    acceptLanguage?: string;
    acceptEncoding?: string;
    referer?: string;
    origin?: string;

    // Computed
    headerCount: number;
    hasAcceptHeader: boolean;
    hasCookies: boolean;
    cookieCount: number;

    // TLS
    tlsVersion?: string;

    // Session
    sessionId?: string;

    // Rate stats (from KV)
    requestsInWindow?: number;

    // Timestamp
    timestamp: number;
}

// ===========================================
// BOT SCORING RESULT
// ===========================================

export interface BotScoringResult {
    score: number; // 0.0 - 1.0
    bucket: 'low' | 'medium' | 'high';
    decision: 'allow' | 'challenge' | 'throttle' | 'block' | 'reroute';
    reasons: Array<{
        rule: string;
        weight: number;
        triggered: boolean;
        explanation: string;
    }>;
    aiResult?: {
        probability: number;
        categories: string[];
        explanation: string;
    };
}

// ===========================================
// LOAD BALANCER RESULT
// ===========================================

export interface LoadBalancerResult {
    backend: Backend;
    strategy: LoadBalancerStrategy;
    candidatesCount: number;
    selectionReason: string;
    latencyEstimate?: number;
}

// ===========================================
// DECISION RESULT
// ===========================================

export type DecisionAction = 'allow' | 'challenge' | 'throttle' | 'block' | 'reroute';

export interface DecisionResult {
    action: DecisionAction;
    reason: string;
    backend?: Backend;

    // Rate limit info
    rateLimited?: boolean;
    retryAfterMs?: number;

    // Bot info
    botScore?: number;
    botBucket?: 'low' | 'medium' | 'high';

    // Metadata
    policyId?: string;
    policyVersion?: string;
}

// ===========================================
// DEFAULT CONFIGURATION
// ===========================================

export function createDefaultConfig(): GlobalConfig {
    const now = new Date().toISOString();

    return {
        version: '1.0.0',
        status: 'draft',
        createdAt: now,
        updatedAt: now,
        backends: [
            {
                id: 'primary',
                name: 'Primary Backend',
                url: 'https://api.example.com',
                weight: 80,
                healthEndpoint: '/health',
                enabled: true,
            },
            {
                id: 'secondary',
                name: 'Secondary Backend',
                url: 'https://api-backup.example.com',
                weight: 20,
                healthEndpoint: '/health',
                enabled: true,
            },
        ],
        policies: [
            {
                id: 'default',
                name: 'Default Policy',
                priority: 0,
                pathPattern: '/**',
                strategy: 'weighted-round-robin',
                backendIds: ['primary', 'secondary'],
                enabled: true,
            },
        ],
        defaultRateLimit: {
            enabled: true,
            windowMs: 60000,
            maxRequests: 100,
            keyType: 'ip',
            subnetMask: 24,
            retryAfterMs: 60000,
        },
        defaultBotGuard: {
            enabled: true,
            thresholds: { low: 0.3, medium: 0.6, high: 0.85 },
            actions: { low: 'allow', medium: 'challenge', high: 'block' },
            useAiClassifier: false,
            aiTimeoutMs: 50,
        },
        defaultStrategy: 'weighted-round-robin',
        telemetrySampleRate: 0.1,
        challengePageUrl: '/challenge',
    };
}
