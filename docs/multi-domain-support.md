# Multi-Domain Support Documentation

## Overview

The load balancer now supports multi-domain (multi-tenant) configurations. Each domain can have its own independent configuration for:
- Backends
- Route policies
- Rate limiting
- Bot detection
- Load balancing strategies

## How It Works

### 1. Domain Extraction

The middleware extracts the domain from the incoming request's `Host` header:

```typescript
// middleware.ts
const hostname = request.headers.get('host') || 'localhost';
const domain = hostname.split(':')[0]; // Remove port if present
const config = await loadConfig(domain);
```

### 2. Configuration Storage

Configurations are stored in the `lb_configs` table with a `domain` column:

- **Unique constraint**: `(domain, version)` - each domain can have multiple config versions
- **Active config lookup**: Queries prioritize domain-specific configs, falling back to 'default' if none exists
- **Default domain**: Uses 'default' if no domain is specified

### 3. Domain-Scoped Components

#### Load Balancer
- Each request uses the domain-specific config
- Backend selection, policies, and routing are all domain-specific
- Metrics are tagged with the domain

#### Rate Limiter
- Rate limit keys use policy IDs which are domain-specific
- Keys format: `rl:{policyId}:{keyType}:{identifier}`
- Since policies come from domain-specific configs, keys are effectively domain-scoped

#### Bot Detection
- Bot detection rules and thresholds are domain-specific
- Each domain can have different bot detection policies

#### Metrics
- All request metrics include a `domain` field
- Dashboard queries can filter by domain
- Metrics are properly isolated per domain

### 4. User-Domain Ownership

Users can only see and manage domains they own:

#### Database Schema
```sql
CREATE TABLE domain_ownership(
  id SERIAL PRIMARY KEY,
  domain VARCHAR(255) NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(domain, user_id)
);
```

#### Ownership Management
- **Auto-assignment**: When a user creates a config for a new domain, ownership is automatically assigned
- **Access control**: Admin API endpoints check ownership before allowing operations
- **Domain listing**: Users can only see configs for domains they own

## API Endpoints

### Admin Config API (`/internal/api/admin/config`)

All endpoints now support domain filtering and ownership checks:

#### GET
- `?domain=example.com` - Get active config for specific domain
- `?list=true&domain=example.com` - List all configs for domain
- Returns 403 if user doesn't own the domain

#### POST
- Creates/updates config for the domain specified in `config.domain`
- Auto-assigns ownership if user is creating config for new domain
- Returns 403 if user doesn't own existing domain

#### PUT
- Activates a config version for a specific domain
- Requires domain ownership

#### DELETE
- Deletes a draft config for a specific domain
- Requires domain ownership

## Usage Examples

### Creating a Domain Configuration

1. **Point your domain to the load balancer** (via CNAME):
   ```
   api.example.com CNAME your-lb.vercel.app
   ```

2. **Create configuration via API**:
   ```bash
   curl -X POST https://your-lb.vercel.app/internal/api/admin/config \
     -H "Content-Type: application/json" \
     -d '{
       "version": "1.0.0",
       "status": "active",
       "domain": "api.example.com",
       "backends": [...],
       "policies": [...]
     }'
   ```

3. **Access via your domain**:
   ```
   https://api.example.com/your-path
   ```

### Dashboard Access

Users logged into the dashboard will:
- Only see domains they own
- Only be able to create/edit configs for domains they own
- Automatically get ownership when creating a config for a new domain

## Configuration Structure

Each domain configuration includes:

```typescript
{
  version: string;
  status: 'draft' | 'active';
  domain?: string; // Optional, defaults to 'default'
  backends: Backend[];
  policies: RoutePolicy[];
  defaultRateLimit: RateLimitConfig;
  defaultBotGuard: BotGuardConfig;
  defaultStrategy: LoadBalancerStrategy;
  // ... other settings
}
```

## Cache Management

Configurations are cached in Redis/KV with domain-specific keys:
- Key format: `lb:config:{domain}`
- Cache TTL: 60 seconds
- Invalidation: Automatically invalidated when active configs are updated

## Metrics and Monitoring

All metrics include domain information:
- Request metrics: `domain` field tracks which domain handled the request
- Dashboard queries: Can filter by `?domain=example.com`
- Aggregations: Stats are calculated per-domain

## Security Considerations

1. **Domain Ownership**: Users can only access domains they own
2. **Default Domain**: The 'default' domain is accessible to all authenticated users (for backwards compatibility)
3. **Auto-assignment**: First user to create a config for a domain becomes the owner
4. **No Cross-Domain Access**: Configs are strictly isolated by domain

## Migration Notes

- Existing configs without a domain are stored with `domain = 'default'`
- The `domain` column was added via migration in `initializeDatabase()`
- Rate limit keys remain compatible (policy IDs are domain-scoped via config)

## Future Enhancements

Potential improvements:
- Domain sharing/collaboration features
- Domain-level analytics dashboard
- Domain templates for quick setup
- Domain verification (DNS TXT record validation)
