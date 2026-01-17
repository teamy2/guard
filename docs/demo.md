# Demo Script

This guide walks through demonstrating the Edge Load Balancer's key features.

## Prerequisites

- Local development server running (`pnpm dev`)
- Or deployed instance

## Demo 1: Normal Traffic Flow

Show that normal browser traffic passes through without issues.

```bash
# Normal request with browser headers
curl -v http://localhost:3000/api/health \
  -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0.0.0" \
  -H "Accept: text/html,application/xhtml+xml,*/*;q=0.8" \
  -H "Accept-Language: en-US,en;q=0.9" \
  -H "Accept-Encoding: gzip, deflate, br"
```

Expected: 200 OK with `X-Request-Id` and `X-Backend` headers.

## Demo 2: Bot Detection

Show how bot-like requests are detected.

```bash
# Missing headers - looks like a bot
curl -v http://localhost:3000/api/test \
  -H "User-Agent: python-requests/2.28.0"
```

Expected: Depending on config, either 403 (blocked) or 302 (challenged).

```bash
# Completely empty headers
curl -v http://localhost:3000/api/test
```

Expected: Higher bot score, likely blocked.

## Demo 3: Rate Limiting

Show rate limiting in action.

```bash
# Send many requests quickly
for i in {1..150}; do
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/test
done
```

Expected: First ~100 return 200, then 429 (Too Many Requests).

## Demo 4: Dashboard

1. Open http://localhost:3000/dashboard
2. Show traffic overview with real-time stats
3. Navigate to Bot Guard page - show score distributions
4. Navigate to Backends page - show health status
5. Navigate to Policies page - show configuration

## Demo 5: Sentry Integration

1. Trigger an error (if any endpoint errors)
2. Open Sentry dashboard
3. Show:
   - Issues tab: grouped errors with context
   - Performance tab: transactions with spans
   - Custom tags: `decision`, `bot_bucket`, `backend`

## Demo 6: Load Balancing Strategies

### Weighted Distribution

With two backends at 80/20 weight:

```bash
# Run 100 requests and count backend distribution
for i in {1..100}; do
  curl -s -D - http://localhost:3000/api/test | grep X-Backend
done | sort | uniq -c
```

Expected: ~80% to primary, ~20% to secondary.

### Health-Aware Failover

1. Configure a backend to be unhealthy (or let health check fail)
2. Show that traffic automatically routes to healthy backends

## Demo 7: Challenge Flow

1. Trigger a challenge (medium bot score request)
2. Show the challenge page
3. Complete the challenge
4. Show the token cookie being set
5. Subsequent requests bypass challenge

## Demo 8: Admin API

```bash
# Get current config
curl http://localhost:3000/api/admin/config \
  -H "Authorization: Bearer YOUR_API_KEY"

# Get backend health
curl http://localhost:3000/api/admin/backends \
  -H "Authorization: Bearer YOUR_API_KEY"

# List all config versions
curl "http://localhost:3000/api/admin/config?list=true" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## Demo 9: Load Test

```bash
# Normal traffic
pnpm load-test -- --requests 1000 --concurrency 20

# Bot simulation
pnpm load-test -- --requests 1000 --concurrency 20 --bot
```

Compare the results - bot traffic should show more blocks/challenges.

## Talking Points

1. **Edge Performance**: All processing happens at the edge, close to users
2. **Privacy by Design**: IPs are hashed, no PII in logs
3. **Observability**: Comprehensive Sentry integration for debugging
4. **Flexibility**: Multiple load balancing strategies, configurable policies
5. **Security**: Rate limiting, bot detection, challenge system
