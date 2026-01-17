# Vercel Edge Load Balancer with Bot Guard

A production-ready smart load balancer built on Vercel Edge with AI/heuristics-based bot detection and comprehensive Sentry instrumentation.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-Vercel-black.svg)
![Runtime](https://img.shields.io/badge/runtime-Edge-green.svg)

## Features

- 🚀 **Edge-first architecture** - Runs on Vercel Edge for global low-latency
- 🛡️ **Bot Guard** - Heuristics + optional AI classifier for bot detection
- ⚖️ **Smart Load Balancing** - Multiple strategies: weighted RR, latency-aware, health-aware, sticky
- 📊 **Sentry Instrumentation** - Errors, traces, metrics, and dashboards
- 🔒 **Rate Limiting** - Per-IP, session, endpoint, or composite keys
- 📈 **Admin Dashboard** - Real-time metrics and policy management
- 🏥 **Health Monitoring** - Automatic backend health checks

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm
- Vercel account
- Sentry account
- Vercel KV instance
- PostgreSQL database (Vercel Postgres, Neon, or Supabase)

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd guard

# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env.local

# Initialize database
pnpm db:init

# Start development server
pnpm dev
```

### Environment Variables

Copy `.env.example` to `.env.local` and configure:

```bash
# Sentry
SENTRY_DSN=your-sentry-dsn
NEXT_PUBLIC_SENTRY_DSN=your-sentry-dsn

# Vercel KV
KV_REST_API_URL=your-kv-url
KV_REST_API_TOKEN=your-kv-token

# PostgreSQL
DATABASE_URL=your-database-url

# Security
ADMIN_API_KEY=your-secure-api-key
IP_HASH_SALT=random-salt-for-ip-hashing
CHALLENGE_SECRET=secret-for-challenge-tokens
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Edge Middleware                          │
├─────────────────────────────────────────────────────────────────┤
│  Request → Features → Rate Limit → Bot Guard → LB → Proxy       │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
         ┌─────────┐    ┌─────────┐    ┌─────────┐
         │Backend 1│    │Backend 2│    │Backend N│
         └─────────┘    └─────────┘    └─────────┘
```

## Request Flow

1. **Feature Extraction** - Extract IP (hashed), UA, headers, geo, etc.
2. **Rate Limiting** - Check against configured limits
3. **Bot Detection** - Score request using heuristics/AI
4. **Backend Selection** - Choose backend based on strategy
5. **Proxy** - Forward request and return response

## Dashboard

Access the dashboard at `/dashboard`:

- **Overview** - Traffic stats, decision distribution
- **Bot Guard** - Score distributions, detection reasons
- **Backends** - Health status, latency metrics
- **Policies** - View and manage configuration

## API Reference

### Admin API

All admin endpoints require `Authorization: Bearer YOUR_API_KEY` header.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/config` | GET | Get active config |
| `/api/admin/config?list=true` | GET | List all config versions |
| `/api/admin/config` | POST | Create/update config |
| `/api/admin/config` | PUT | Activate a draft config |
| `/api/admin/config?version=x` | DELETE | Delete a draft config |
| `/api/admin/backends` | GET | Get backend health status |

### Public API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check endpoint |
| `/api/challenge/verify` | POST | Verify challenge response |

## Load Balancing Strategies

| Strategy | Description |
|----------|-------------|
| `weighted-round-robin` | Distribute by weight in rotation |
| `latency-aware` | Prefer backends with lower P95 latency |
| `health-aware` | Avoid unhealthy backends |
| `sticky` | Route same client to same backend |
| `random` | Random selection |

## Bot Detection Rules

The heuristics engine evaluates:

- Missing/empty User-Agent
- Known bot patterns
- Missing Accept headers
- Few headers (< 5)
- Missing Accept-Language
- High request frequency
- Unusual HTTP methods
- Deep paths without referer

## Sentry Integration

### Transaction Naming
```
edge.balancer GET /api/users
```

### Span Operations
- `edge.feature_extract`
- `edge.rate_limit`
- `edge.bot_heuristics`
- `edge.route_select`
- `edge.proxy`

### Metrics
- `requests_total{decision,route,backend}`
- `bot_score{route}`
- `backend_latency_ms{backend,route}`
- `backend_health{backend}`

### Recommended Alerts
See `sentry/alerts.json` for preconfigured alert rules.

## Testing

```bash
# Run unit tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Run load test
pnpm load-test

# Run load test with bot simulation
pnpm load-test -- --bot
```

## Deployment

### Vercel

```bash
# Install Vercel CLI
pnpm add -g vercel

# Deploy
vercel

# Set environment variables
vercel env add SENTRY_DSN
# ... repeat for all variables
```

### Post-Deployment

1. Initialize the database: Run `pnpm db:init` with production DATABASE_URL
2. Create initial config via Admin API
3. Verify cron job is running (check `/api/cron/health`)
4. Verify Sentry is receiving events

## Configuration Example

```json
{
  "version": "1.0.0",
  "status": "active",
  "backends": [
    {
      "id": "primary",
      "name": "Primary API",
      "url": "https://api.example.com",
      "weight": 80,
      "healthEndpoint": "/health"
    }
  ],
  "policies": [
    {
      "id": "api-policy",
      "name": "API Routes",
      "pathPattern": "/api/**",
      "strategy": "latency-aware",
      "backendIds": ["primary"],
      "rateLimit": {
        "enabled": true,
        "windowMs": 60000,
        "maxRequests": 100
      },
      "botGuard": {
        "enabled": true,
        "thresholds": { "low": 0.3, "medium": 0.6, "high": 0.85 },
        "actions": { "low": "allow", "medium": "challenge", "high": "block" }
      }
    }
  ]
}
```

## License

MIT
