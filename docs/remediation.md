# Automated Remediation System

## Overview

The automated remediation system detects bot attacks and automatically adjusts rate limits to protect your infrastructure. This system integrates with Sentry for monitoring and alerting.

## Bot Attack Detection

The system detects bot attacks by analyzing recent request metrics:

### Detection Criteria

- **High block rate**: >10% of requests are blocked
- **High challenge rate**: >20% of requests are challenged
- **High bot scores**: >30% of requests have bot scores ≥ 0.7
- **High average bot score**: Average bot score > 0.6

When these conditions are met, an attack score is calculated (0-1). An attack is detected when the score exceeds 0.4.

### Attack Score Calculation

```
attackScore = min(1, (
    (blockRate * 2) +           // Blocks are strong indicator
    (challengeRate * 1.5) +     // Challenges are moderate indicator
    (highScoreRate * 1.2) +     // High scores are moderate indicator
    (avgBotScore > 0.6 ? 0.3 : 0)  // High average score
))
```

## Automatic Rate Limit Adjustment

When a bot attack is detected, the system automatically:

1. **Reduces max requests by 60%**: Keeps only 40% of original limit (minimum 10 requests)
2. **Reduces window size**: Makes limits more aggressive (at least 30s, or 70% of original)
3. **Disables burst limits**: No burst traffic allowed during attacks
4. **Ensures rate limiting is enabled**: Activates rate limiting if it was disabled

### Example

**Before Attack:**
- Max requests: 100 per minute
- Window: 60 seconds
- Burst limit: 20

**During Attack (Auto-Adjusted):**
- Max requests: 40 per minute (60% reduction)
- Window: 42 seconds (30% reduction)
- Burst limit: Disabled

## API Endpoints

### POST `/internal/api/remediation/bot-attack`

Manually trigger bot attack detection and remediation.

**Authentication:**
- Optional: `Authorization: Bearer {SENTRY_WEBHOOK_SECRET}`

**Response:**
```json
{
  "success": true,
  "action": "rate_limits_adjusted" | "no_action",
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

### GET `/internal/api/remediation/bot-attack`

Check current bot attack status without taking action.

**Response:**
```json
{
  "isAttack": true,
  "metrics": {
    "totalRequests": 1000,
    "botBlocks": 150,
    "botChallenges": 200,
    "throttles": 50,
    "highBotScores": 300,
    "attackScore": 0.65
  },
  "timestamp": "2024-01-01T12:00:00Z"
}
```

## Sentry Webhook Integration

The bot attack check is triggered by Sentry webhooks when alert rules detect bot attack patterns. This provides real-time detection and remediation without requiring cron jobs.

## Sentry Integration

### Webhook Setup

1. Go to Sentry → Settings → Integrations → Webhooks
2. Add webhook URL: `https://your-domain.com/internal/api/remediation/bot-attack`
3. Set webhook secret in environment variable: `SENTRY_WEBHOOK_SECRET`
4. Configure alert rules (see below) to trigger the webhook

### Alert Rules Configuration

Create Sentry alert rules that detect bot attack patterns and trigger the webhook:

#### Option 1: Metric-Based Alert (Recommended)

**Alert Rule:**
- **Name**: "Bot Attack Detected - Auto Remediate"
- **Type**: Metric Alert
- **Metric**: `count()` of events
- **Condition**: 
  - When `count()` is greater than `50` in `5 minutes`
  - Where `module:bot-guard` AND `decision:block` OR `decision:challenge`
- **Action**: Send webhook to `/internal/api/remediation/bot-attack`

#### Option 2: Issue-Based Alert

**Alert Rule:**
- **Name**: "High Bot Detection Rate"
- **Type**: Issue Alert
- **Condition**: 
  - When an issue is created
  - Where tags include `module:bot-guard` AND `bot_bucket:high`
  - And issue count > 10 in 5 minutes
- **Action**: Send webhook to `/internal/api/remediation/bot-attack`

#### Option 3: Custom Query Alert

**Alert Rule:**
- **Name**: "Bot Attack Pattern Detected"
- **Type**: Metric Alert
- **Query**: 
  ```
  count():>50
  module:bot-guard
  (decision:block OR decision:challenge)
  ```
- **Time Window**: 5 minutes
- **Action**: Send webhook to `/internal/api/remediation/bot-attack`

### Webhook Payload

The endpoint accepts Sentry webhook payloads but will check for attacks regardless of payload content. The webhook payload is logged for debugging but doesn't affect the detection logic.

**Example Sentry Webhook Payload:**
```json
{
  "action": "triggered",
  "data": {
    "event": {
      "eventID": "abc123",
      "tags": [{"key": "module", "value": "bot-guard"}]
    },
    "triggered_rule": {
      "id": "rule-123",
      "name": "Bot Attack Detected"
    }
  }
}
```

### Alert Rules

Create Sentry alert rules that trigger the webhook:

**Example Alert Rule:**
- Condition: `count()` of issues with tag `module:bot-guard` > 50 in 5 minutes
- Action: Send webhook to `/internal/api/remediation/bot-attack`

### Sentry Events

The system automatically logs to Sentry:

- **Attack Detected**: Warning-level message with attack metrics
- **Rate Limits Adjusted**: Context includes old/new rate limit values
- **Remediation Errors**: Exceptions are captured with full context

## Environment Variables

```bash
# Required: Webhook secret for Sentry integration
# Set this in Sentry webhook settings and match it here
SENTRY_WEBHOOK_SECRET=your-secret-here
```

## Monitoring

### Metrics Tracked

- Attack detection rate
- Rate limit adjustments
- False positive rate
- Time to remediation

### Sentry Context

When an attack is detected, Sentry receives:
- Attack metrics (blocks, challenges, scores)
- Rate limit changes (old vs new values)
- Timestamp and duration

## Manual Override

To manually restore rate limits after an attack:

1. Go to `/internal/dashboard/policies`
2. Edit the rate limit configuration
3. Increase `maxRequests` back to desired value
4. Save and activate the config

The system will not automatically restore limits - this must be done manually to prevent re-enabling attacks.

## Best Practices

1. **Monitor attack patterns**: Review Sentry alerts regularly
2. **Tune thresholds**: Adjust detection criteria based on your traffic patterns
3. **Review false positives**: Check if legitimate traffic is being blocked
4. **Set up alerts**: Configure Sentry alerts for attack detection
5. **Document incidents**: Keep records of attacks and responses

## Troubleshooting

### Rate limits not adjusting

- Check that metrics are being recorded in `request_metrics` table
- Verify Sentry alert rules are configured and triggering
- Check Sentry webhook delivery logs
- Verify `SENTRY_WEBHOOK_SECRET` matches Sentry configuration
- Check Sentry for errors in remediation endpoint

### False positives

- Adjust attack score threshold (currently 0.4)
- Review detection criteria in `detectBotAttack()` function
- Consider whitelisting legitimate IPs

### Webhook not triggering

- Verify `SENTRY_WEBHOOK_SECRET` matches Sentry configuration
- Check Sentry webhook delivery logs
- Verify endpoint is accessible from Sentry
