# Deployment Guide

## Prerequisites

1. **Vercel Account** - Sign up at [vercel.com](https://vercel.com)
2. **Sentry Account** - Create a project at [sentry.io](https://sentry.io)
3. **GitHub Repository** - Push your code to GitHub

## Step 1: Set Up Storage

### Vercel KV (Rate Limiting)

1. Go to Vercel Dashboard → Storage
2. Create a new KV database
3. Copy the connection strings to your environment

### PostgreSQL (Configuration)

Choose one:

**Option A: Vercel Postgres**
1. Go to Vercel Dashboard → Storage
2. Create a new Postgres database
3. Copy the `DATABASE_URL`

**Option B: Neon**
1. Create a project at [neon.tech](https://neon.tech)
2. Copy the connection string

**Option C: Supabase**
1. Create a project at [supabase.com](https://supabase.com)
2. Go to Settings → Database → Connection string

## Step 2: Configure Sentry

1. Create a new project in Sentry (Next.js)
2. Copy the DSN
3. Create an auth token for source map uploads

## Step 3: Deploy to Vercel

### Option A: Vercel Dashboard

1. Import your GitHub repository
2. Configure environment variables (see below)
3. Deploy

### Option B: Vercel CLI

```bash
# Install Vercel CLI
pnpm add -g vercel

# Link to project
vercel link

# Set environment variables
vercel env add SENTRY_DSN production
vercel env add NEXT_PUBLIC_SENTRY_DSN production
vercel env add KV_REST_API_URL production
vercel env add KV_REST_API_TOKEN production
vercel env add DATABASE_URL production
vercel env add ADMIN_API_KEY production
vercel env add IP_HASH_SALT production
vercel env add CHALLENGE_SECRET production
vercel env add CRON_SECRET production

# Deploy
vercel --prod
```

## Step 4: Initialize Database

After deployment, run the database initialization:

```bash
# Set DATABASE_URL to production value
export DATABASE_URL="your-production-database-url"

# Run init script
pnpm db:init
```

Or call the API endpoint:
```bash
curl -X POST https://your-domain.vercel.app/api/admin/init \
  -H "Authorization: Bearer YOUR_ADMIN_API_KEY"
```

## Step 5: Configure Initial Policies

Create your first configuration:

```bash
curl -X POST https://your-domain.vercel.app/api/admin/config \
  -H "Authorization: Bearer YOUR_ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "version": "1.0.0",
    "status": "active",
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z",
    "backends": [
      {
        "id": "primary",
        "name": "Primary API",
        "url": "https://your-backend.com",
        "weight": 100,
        "healthEndpoint": "/health",
        "enabled": true
      }
    ],
    "policies": [
      {
        "id": "default",
        "name": "Default Policy",
        "priority": 0,
        "pathPattern": "/**",
        "strategy": "weighted-round-robin",
        "backendIds": ["primary"],
        "enabled": true
      }
    ]
  }'
```

## Step 6: Verify Deployment

1. **Health Check**
   ```bash
   curl https://your-domain.vercel.app/api/health
   ```

2. **Dashboard**
   - Visit `https://your-domain.vercel.app/dashboard`

3. **Sentry**
   - Check that events are appearing in your Sentry project

4. **Cron Job**
   - Verify health checks are running (check Vercel dashboard → Functions)

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `SENTRY_DSN` | Yes | Sentry DSN for server/edge |
| `NEXT_PUBLIC_SENTRY_DSN` | Yes | Sentry DSN for client |
| `SENTRY_AUTH_TOKEN` | No | For source map uploads |
| `KV_REST_API_URL` | Yes | Vercel KV URL |
| `KV_REST_API_TOKEN` | Yes | Vercel KV token |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `ADMIN_API_KEY` | Yes | API key for admin endpoints |
| `IP_HASH_SALT` | Yes | Salt for IP hashing (privacy) |
| `CHALLENGE_SECRET` | Yes | Secret for challenge tokens |
| `CRON_SECRET` | No | Secret for cron job auth |
| `AI_CLASSIFIER_URL` | No | Optional AI classifier endpoint |
| `AI_CLASSIFIER_API_KEY` | No | AI classifier auth |
| `TELEMETRY_SAMPLE_RATE` | No | Sampling rate (default: 0.1) |

## Troubleshooting

### Middleware not running
- Check that `middleware.ts` is at the project root
- Verify the matcher patterns don't exclude your routes

### Rate limiting not working
- Ensure KV is properly configured
- Check KV connection in Vercel dashboard

### Database errors
- Verify `DATABASE_URL` is correct
- Run `pnpm db:init` to create tables

### Sentry not receiving events
- Check DSN is correct
- Verify sample rate isn't too low
