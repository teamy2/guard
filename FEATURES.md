# Features

This document outlines the key features implemented in the load balancer and bot protection system.

## Table of Contents

- [AI Classifier Performance Monitoring](#ai-classifier-performance-monitoring)
- [Request Journey Visualization](#request-journey-visualization)
- [Automated Remediation System](#automated-remediation-system)
- [Challenge Token System](#challenge-token-system)
- [Real-time Metrics Dashboard](#real-time-metrics-dashboard)
- [Modern Admin Interface (Shadcn/UI)](#modern-admin-interface-shadcnui)
- [Internal Route Protection & API](#internal-route-protection--api)
- [Edge Infrastructure & Robustness](#edge-infrastructure--robustness)
- [Sentry Integration](#sentry-integration)

---

## AI Classifier Performance Monitoring

### Overview
Comprehensive monitoring and tracking of AI classifier performance to detect model drift, accuracy issues, and false positives/negatives.

### Features

#### Performance Tracking
- **Score Comparison**: Tracks differences between heuristic and AI classifier scores
- **Agreement Detection**: Identifies when both systems agree (within 20% threshold)
- **Model Drift Detection**: Alerts when score differences exceed 0.5 (indicating potential model degradation)
- **Disagreement Tracking**: Monitors cases where AI and heuristics disagree on bot classification

#### Metrics Collected
- Heuristic score vs AI score comparison
- Final blended score
- Score difference calculations
- Agreement/disagreement rates
- Decision outcomes

#### Sentry Integration
- Automatic logging of performance metrics to Sentry
- Warning-level alerts for model drift
- Context-rich error tracking for AI classifier failures
- Structured data for metrics aggregation

### Implementation
- **Location**: `src/bot-guard/decision-engine.ts`, `src/sentry/instrumentation.ts`
- **Functions**: `trackAIClassifierPerformance()`, `trackAIClassifierError()`
- **Sentry Spans**: Dedicated `ai.classifier` operation spans

### Usage
Performance tracking is automatic when AI classifier is enabled. Metrics are sent to Sentry and can be viewed in:
- Sentry Performance → Spans with `ai.classifier` operation
- Sentry Issues → Warnings for model drift
- Sentry Metrics → Custom metrics for AI performance

---

## Request Journey Visualization

### Overview
Complete end-to-end visualization of every request through the load balancer, showing all decision points and reasoning.

### Features

#### Step-by-Step Journey Tracking
1. **Feature Extraction**: Extracts request features (IP, user agent, headers, etc.)
2. **Rate Limiting**: Checks rate limits and remaining quota
3. **Bot Detection**: Evaluates bot score using heuristics and AI
4. **Backend Selection**: Chooses backend using configured strategy
5. **Proxy**: Forwards request to selected backend

#### Detailed Breadcrumbs
Each step includes:
- Stage information
- Decision reasoning
- Performance metrics
- Context for debugging

#### Sentry Trace Visualization
- Full request journey as a single trace
- Child spans for each decision point
- Attributes on spans for filtering and analysis
- Breadcrumbs showing decision flow

### Implementation
- **Location**: `src/edge/balancer.ts`, `src/sentry/instrumentation.ts`
- **Transaction Name**: `Request Journey: {method} {path}`
- **Breadcrumb Category**: `request.journey`

### Usage
View in Sentry Performance:
1. Navigate to Sentry → Performance
2. Filter by operation: `http.server`
3. View trace details to see full journey
4. Expand spans to see decision points and breadcrumbs

### Example Trace Structure
```
Request Journey: GET /api/users
├── Step 1: Extract request features
│   ├── IP hash: abc123
│   ├── User agent length: 120
│   └── Country: US
├── Step 2: Check rate limits
│   ├── Allowed: true
│   ├── Remaining: 95
│   └── Key type: ip
├── Step 3: Evaluate bot score
│   ├── Heuristic score: 0.3
│   ├── AI score: 0.25
│   ├── Final score: 0.28
│   └── Decision: allow
├── Step 4: Select backend
│   ├── Strategy: latency-aware
│   ├── Selected: backend-1
│   └── Reason: lowest latency
└── Step 5: Proxy to backend
    ├── Backend: backend-1
    ├── Latency: 45ms
    └── Status: 200
```

---

## Automated Remediation System

### Overview
Automatically detects bot attacks and adjusts rate limits in real-time to protect infrastructure.

### Features

#### Bot Attack Detection
Detects attacks by analyzing:
- **Block Rate**: >10% of requests blocked
- **Challenge Rate**: >20% of requests challenged
- **High Bot Scores**: >30% with scores ≥ 0.7
- **Average Bot Score**: > 0.6

Attack score calculation:
```
attackScore = min(1, (
    (blockRate * 2) +           // Blocks are strong indicator
    (challengeRate * 1.5) +     // Challenges are moderate indicator
    (highScoreRate * 1.2) +     // High scores are moderate indicator
    (avgBotScore > 0.6 ? 0.3 : 0)  // High average score
))
```

Attack is detected when score > 0.4.

#### Automatic Rate Limit Adjustment
When attack detected:
- **Reduces max requests by 60%**: Keeps only 40% of original (minimum 10)
- **Reduces window size by 30%**: Makes limits more aggressive (minimum 30s)
- **Disables burst limits**: No burst traffic during attacks
- **Ensures rate limiting enabled**: Activates if disabled

#### Sentry Webhook Integration
- Triggered by Sentry alert rules
- Real-time detection and remediation
- Automatic logging to Sentry with full context

### Implementation
- **Location**: `src/app/internal/api/remediation/bot-attack/route.ts`
- **Endpoint**: `POST /internal/api/remediation/bot-attack`
- **Documentation**: `docs/remediation.md`

### Setup

#### 1. Environment Variables
```bash
SENTRY_WEBHOOK_SECRET=your-secret-here
```

#### 2. Sentry Webhook Configuration
1. Go to Sentry → Settings → Integrations → Webhooks
2. Add webhook URL: `https://your-domain.com/internal/api/remediation/bot-attack`
3. Set webhook secret matching `SENTRY_WEBHOOK_SECRET`

#### 3. Sentry Alert Rules
Create alert rules that trigger on bot attack patterns:

**Metric-Based Alert (Recommended)**:
- Type: Metric Alert
- Condition: `count()` > 50 in 5 minutes
- Filter: `module:bot-guard` AND (`decision:block` OR `decision:challenge`)
- Action: Send webhook to `/internal/api/remediation/bot-attack`

### API Endpoints

#### POST `/internal/api/remediation/bot-attack`
Manually trigger bot attack detection and remediation.

**Response**:
```json
{
  "success": true,
  "action": "rate_limits_adjusted",
  "message": "Bot attack detected - rate limits automatically reduced",
  "metrics": {
    "totalRequests": 1000,
    "botBlocks": 150,
    "botChallenges": 200,
    "throttles": 50,
    "highBotScores": 300,
    "attackScore": 0.65
  },
  "changes": {
    "old_max_requests": 100,
    "new_max_requests": 40,
    "old_window_ms": 60000,
    "new_window_ms": 42000
  }
}
```

#### GET `/internal/api/remediation/bot-attack`
Check current bot attack status without taking action.

---

## Challenge Token System

### Overview
Proof-of-human verification system that issues tokens after successful CAPTCHA completion, allowing users to bypass bot detection for a period.

### Features

#### Challenge Flow
1. User is redirected to challenge page when bot score is high
2. User completes hCaptcha verification
3. Server verifies CAPTCHA and issues JWT token
4. Token stored in HTTP-only cookie
5. User can now access protected resources

#### Token Properties
- **JWT-based**: Secure token with expiration
- **IP-bound**: Validated against hashed IP address
- **Time-limited**: Valid for up to 7 days
- **HTTP-only Cookie**: Prevents XSS attacks

#### Integration
- **Challenge Page**: `/challenge` - User-facing CAPTCHA interface
- **Verification API**: `/internal/api/challenge/verify` - Server-side verification
- **Token Validation**: Automatic validation in bot detection pipeline
- **Auth Bypass**: Challenge endpoints don't require authentication

### Implementation
- **Location**: 
  - `src/app/challenge/page.tsx` - Challenge UI
  - `src/app/internal/api/challenge/verify/route.ts` - Verification endpoint
  - `src/bot-guard/challenge-token.ts` - Token management
- **Cookie Name**: `_challenge_token`
- **Cookie Attributes**: HTTP-only, Secure (in production), SameSite=Lax

### Configuration
```bash
HCAPTCHA_SITE_KEY=your-site-key
HCAPTCHA_SECRET_KEY=your-secret-key
CHALLENGE_SECRET=your-challenge-secret
```

### Next.js Integration
- Uses `useRouter()` for client-side navigation
- Prevents fetch from following redirects automatically
- Proper cookie handling with server-side redirects

---

## Real-time Metrics Dashboard

### Overview
Comprehensive dashboard showing real-time metrics from actual request data stored in Postgres.

### Features

#### Dashboard Metrics (`/internal/dashboard`)
- **Total Requests**: Count of all requests
- **Request Rate**: Requests per second
- **Average Latency**: P50, P95, P99 percentiles
- **Decision Distribution**: Allow, Block, Challenge, Throttle breakdown
- **Time Range**: Configurable (default: last hour)

#### Bot Guard Dashboard (`/internal/dashboard/bots`)
- **Score Buckets**: Low, Medium, High risk distribution
- **Top Detection Reasons**: Most triggered bot detection rules
- **Actions Taken**: Breakdown of allow/block/challenge/throttle/reroute
- **Configuration**: Current bot guard settings
- **AI Classifier Status**: Enabled/disabled state

#### Backends Dashboard (`/internal/dashboard/backends`)
- **Backend Health**: Real-time health status
- **Latency Comparison**: P95 latency per backend
- **Error Rates**: Status code distribution
- **Selection Statistics**: Backend selection frequency

### Data Collection
- **Edge Runtime**: Collects metrics during request processing
- **HTTP API**: Sends metrics to Node.js runtime via `/internal/api/metrics/record`
- **Postgres Storage**: All metrics stored in `request_metrics` table
- **Real-time Updates**: Dashboard fetches latest data on load

### Implementation
- **Storage**: `src/config/storage.ts` - Database operations
- **API**: `src/app/internal/api/metrics/*` - Metrics endpoints
- **Dashboard**: `src/app/internal/dashboard/*` - Dashboard pages

---

## Modern Admin Interface (Shadcn/UI)

### Overview
A premium, dark-mode first administrative dashboard built with shadcn/ui and Tailwind CSS v4, providing a professional and consistent user experience.

### Features
- **Shadcn/UI Components**: Fully migrated from custom CSS to standardized accessible components (Card, Button, Badge, Tabs, etc.).
- **Semantic Theming**: Deep integration with Tailwind CSS semantic variables (`--background`, `--muted`, `--accent`) for easy theming and consistent visuals.
- **Responsive Layout**: Sidebar-based navigation optimized for desktop and mobile management.
- **Forced Dark Mode**: Purpose-built high-contrast dark theme for monitoring-heavy workflows.

### Components Migrated
- **Policy Management**: Intuitive builders for routing rules and bot configurations.
- **Backends View**: Visual health indicators and performance metrics per upstream service.
- **Bot Analysis**: Clean visualization of bot scores and detection triggers using modern UI patterns.
- **System Stats**: High-level overview cards for critical infrastructure KPIs.
- **Enforced Dark Mode**: Application-level theme enforcement ensuring the dashboard is always viewed in a high-contrast, accessible dark theme (`src/app/layout.tsx`).

---

## Internal Route Protection & API

### Overview
Secure isolation of administrative endpoints and management dashboard from the core request pipeline.

### Features
- **Route Namespace Isolation**: All admin features grouped under the `/internal` path for clear separation of concerns.
- **Next.js Compatibility Fix**: Resolved `404` issues by migrating from private Next.js folders (`/__internal__`) to standard routing while maintaining middleware isolation.
- **Middleware Exclusion Logic**: Sophisticated `matcher` and `shouldExcludePath` logic ensures internal administrative paths never pass through the balancer logic, preventing performance overhead and recursive routing loops.
- **Unified Internal API**: Centralized endpoints for configuration (`/internal/api/admin/config`) and metrics tracking.

---

## Edge Infrastructure & Robustness

### Overview
Industrial-strength Edge middleware designed to protect the system without becoming a single point of failure.

### Features
- **Fail-Open Architecture**: Configured to pass-through traffic if upstream configuration stores (Redis/Postgres) are unavailable, ensuring zero downtime even during partial outages.
- **Graceful Error Handling**: `loadConfig()` returns localized fallback defaults if the database connection strings are missing or invalid, allowing the system to operate on safe defaults.
- **Edge-Ready Observability**: 
  - **Exception Transmissions**: Fixed "missing exception" bugs in Edge runtime using `await Sentry.flush(2000)`, ensuring telemetry is sent before function termination.
  - **Decision Traceability**: Real-time `Sentry.addBreadcrumb` logging that persists request-level context (IP hashes, UA status, logic steps) into Sentry frames.
- **Privacy-Safe Hashing**: IP addresses are salt-hashed using a rotating `SHA-256` key to ensure PII compliant logging and rate-limiting.
- **Safe KV Initialization**: Defensive Redis client creation that gracefully falls back if `KV_URL` or tokens are missing.

### Implementation
- **Location**: `src/edge/balancer.ts`, `src/config/loader.ts`, `middleware.ts`
- **Fail-Safe**: Transparent fallback to heuristics-only bot detection if AI classification or KV cache fails.

---

## Sentry Integration

### Overview
Comprehensive observability and monitoring using Sentry for errors, performance, and custom metrics.

### Features

#### Error Tracking
- Automatic exception capture
- Context-rich error reports
- Module-based error grouping
- Fingerprinting for similar errors

#### Performance Monitoring
- Request tracing with full journey
- Span-level performance metrics
- Backend latency tracking
- Bot detection performance

#### Custom Metrics
- Bot score distributions
- Rate limit triggers
- AI classifier performance
- Request decision tracking

#### Alerting
- Webhook integration for automated remediation
- Custom alert rules for bot attacks
- Model drift warnings
- Backend health alerts

### Instrumentation Points

#### Request Processing
- Feature extraction spans
- Rate limit checks
- Bot detection (heuristics + AI)
- Backend selection
- Proxy operations

#### Bot Guard
- Heuristic rule evaluation
- AI classifier calls
- Score calculations
- Decision making

#### Load Balancing
- Strategy execution
- Backend health checks
- Latency measurements
- Selection reasoning

### Configuration
```bash
NEXT_PUBLIC_SENTRY_DSN=your-dsn
SENTRY_ORG=your-org
SENTRY_PROJECT=your-project
SENTRY_WEBHOOK_SECRET=your-webhook-secret
```

### Sentry Features Used
- **Traces**: Full request journey visualization
- **Spans**: Detailed operation tracking
- **Breadcrumbs**: Decision point logging
- **Context**: Rich metadata for debugging
- **Metrics**: Custom performance metrics
- **Alerts**: Automated webhook triggers
- **Seer**: AI-powered debugging assistance

### Viewing Data in Sentry
- **Performance**: `https://sentry.io/performance/`
- **Issues**: `https://sentry.io/issues/`
- **Metrics**: `https://sentry.io/metrics/`
- **Alerts**: `https://sentry.io/alerts/`

---

## Additional Features

### Rate Limiting
- Configurable per-policy rate limits
- Multiple key types (IP, subnet, session, endpoint)
- Sliding window implementation
- Burst limit support
- Dynamic retry-after calculation

### Load Balancing Strategies
- Weighted Round Robin
- Latency-Aware
- Health-Aware
- Sticky Sessions

### Bot Detection
- Heuristic-based scoring
- AI classifier integration
- Configurable thresholds
- Multiple action types (allow, challenge, throttle, block, reroute)

### Configuration Management
- Version-controlled configs
- Draft and active states
- Policy-based routing
- Real-time config updates

---

## Getting Started

See the main [README.md](./README.md) for setup instructions and deployment guide.

For detailed documentation on specific features:
- [Remediation System](./docs/remediation.md)
- [Deployment Guide](./docs/deploy.md)
- [Runbooks](./docs/runbooks.md)
