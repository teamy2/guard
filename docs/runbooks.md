# Operational Runbooks

## Runbook 1: High Block Rate Alert

**Trigger**: Spike in blocked requests (>100 in 5 minutes)

### Diagnosis

1. Check Sentry for `decision:block` tag distribution
2. Look at `bot.reasons` in event context
3. Check if a specific route/endpoint is targeted

### Actions

**If legitimate attack:**
- Monitor, system is working as intended
- Consider lowering thresholds if attack is severe

**If false positives:**
1. Identify the pattern causing blocks
2. Lower bot score for specific rules:
   ```bash
   # Update config to raise thresholds
   curl -X POST /api/admin/config \
     -H "Authorization: Bearer $ADMIN_API_KEY" \
     -d '{"defaultBotGuard": {"thresholds": {"high": 0.9}}}'
   ```
3. Add to allowlist if known good IPs

---

## Runbook 2: Backend Health Down

**Trigger**: Backend health = 0 for >2 minutes

### Diagnosis

1. Check `/api/admin/backends` for health status
2. Manually test backend health endpoint
3. Check backend service logs

### Actions

**If backend is actually down:**
1. System auto-routes to healthy backends
2. Investigate and fix backend
3. Health will auto-recover on next cron check

**If false positive (backend is healthy):**
1. Check network connectivity from Vercel edge
2. Verify health endpoint returns 200
3. Check for timeouts (must respond <5s)

---

## Runbook 3: High Latency Alert

**Trigger**: P95 latency >500ms for 5+ minutes

### Diagnosis

1. Check Sentry Performance → Transactions
2. Identify slow spans (feature extraction, proxy, etc.)
3. Check backend latency vs edge processing

### Actions

**If backend is slow:**
1. If latency-aware routing is enabled, traffic auto-adjusts
2. Consider reducing traffic to slow backend
3. Investigate backend performance

**If edge processing is slow:**
1. Check for expensive operations
2. Review rate limiting (KV performance)
3. Consider sampling reduction

---

## Runbook 4: Rate Limit Exhaustion

**Trigger**: >1000 rate-limited requests in 5 minutes

### Diagnosis

1. Check if single IP or distributed
2. Review rate limit configuration
3. Check if legitimate traffic spike

### Actions

**If attack:**
- Rate limiting working as intended
- Consider stricter limits

**If legitimate traffic:**
1. Increase limits for affected routes
2. Consider session-based vs IP-based limits
3. Add known good IPs to allowlist

---

## Runbook 5: Sentry Not Receiving Events

**Trigger**: No events in Sentry for >10 minutes

### Diagnosis

1. Check sample rate configuration
2. Verify `SENTRY_DSN` environment variable
3. Check Vercel function logs

### Actions

1. Verify DSN is correct
2. Check sample rate isn't 0
3. Test with manual error:
   ```bash
   curl http://your-site/api/test-error
   ```
4. Check Sentry project quota

---

## Runbook 6: KV Connection Issues

**Trigger**: Rate limiting not working, KV errors

### Diagnosis

1. Check Vercel KV dashboard
2. Look for connection errors in logs
3. Verify environment variables

### Actions

1. Fail-open is enabled (requests still pass)
2. Check KV quota/usage
3. Verify `KV_REST_API_*` env vars
4. Rotate tokens if needed

---

## Runbook 7: Config Update Rollback

**Trigger**: Bad config deployed, need to revert

### Actions

1. List available configs:
   ```bash
   curl "/api/admin/config?list=true" \
     -H "Authorization: Bearer $ADMIN_API_KEY"
   ```

2. Activate previous version:
   ```bash
   curl -X PUT /api/admin/config \
     -H "Authorization: Bearer $ADMIN_API_KEY" \
     -d '{"version": "previous-version-id"}'
   ```

3. Verify rollback:
   ```bash
   curl /api/admin/config \
     -H "Authorization: Bearer $ADMIN_API_KEY"
   ```

---

## Common Checks

### Verify System Health
```bash
curl https://your-site.vercel.app/api/health
```

### Check Active Config
```bash
curl https://your-site.vercel.app/api/admin/config \
  -H "Authorization: Bearer $ADMIN_API_KEY"
```

### Check Backend Status
```bash
curl https://your-site.vercel.app/api/admin/backends \
  -H "Authorization: Bearer $ADMIN_API_KEY"
```

### Force Health Check
```bash
curl https://your-site.vercel.app/api/cron/health \
  -H "Authorization: Bearer $CRON_SECRET"
```
