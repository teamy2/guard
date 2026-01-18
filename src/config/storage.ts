import { sql } from '@vercel/postgres';
import type { GlobalConfig, BackendHealth } from './schema';
import { GlobalConfigSchema, createDefaultConfig } from './schema';

/**
 * Get the active configuration from the database
 */
/**
 * Get the active configuration from the database for a specific domain
 */
export async function getActiveConfig(domain: string = 'localhost'): Promise<GlobalConfig> {
  try {
    const result = await sql`
      SELECT config_data FROM lb_configs 
      WHERE status = 'active' AND (domain = ${domain} OR domain = 'default')
      ORDER BY 
        CASE WHEN domain = ${domain} THEN 1 ELSE 2 END,
        updated_at DESC 
      LIMIT 1
    `;

    if (result.rows.length === 0) {
      // Return default config if none exists
      return createDefaultConfig();
    }

    const parsed = GlobalConfigSchema.parse(result.rows[0].config_data);
    return parsed;
  } catch (error) {
    console.error('[Config] Failed to load config from DB:', error);
    return createDefaultConfig();
  }
}

/**
 * Get a specific config version
 */
export async function getConfigByVersion(version: string): Promise<GlobalConfig | null> {
  try {
    const result = await sql`
      SELECT config_data FROM lb_configs 
      WHERE version = ${version}
      LIMIT 1
    `;

    if (result.rows.length === 0) {
      return null;
    }

    return GlobalConfigSchema.parse(result.rows[0].config_data);
  } catch (error) {
    console.error('[Config] Failed to load config version:', error);
    return null;
  }
}

/**
 * Save a new configuration
 */
export async function saveConfig(config: GlobalConfig): Promise<void> {
  const now = new Date().toISOString();
  const configData = {
    ...config,
    updatedAt: now,
  };

  const domain = config.domain || 'default';

  await sql`
    INSERT INTO lb_configs (version, status, config_data, created_at, updated_at, domain)
    VALUES (${config.version}, ${config.status}, ${JSON.stringify(configData)}, ${now}, ${now}, ${domain})
    ON CONFLICT (domain, version) 
    DO UPDATE SET 
      status = ${config.status},
      config_data = ${JSON.stringify(configData)},
      updated_at = ${now}
  `;
}

/**
 * Activate a draft configuration
 */
export async function activateConfig(version: string, domain: string = 'default'): Promise<void> {
  // Deactivate all other configs for this domain
  await sql`
    UPDATE lb_configs SET status = 'draft' WHERE status = 'active' AND domain = ${domain}
    `;

  // Activate the specified version for this domain
  await sql`
    UPDATE lb_configs SET status = 'active', updated_at = NOW()
    WHERE version = ${version} AND domain = ${domain}
  `;
}

/**
 * Get all config versions for a domain
 */
export async function listConfigs(domain?: string): Promise<Array<{ version: string; status: string; updatedAt: string; domain: string }>> {
  // Require domain - no global queries
  if (!domain) {
    return [];
  }

  const result = await sql`
    SELECT version, status, updated_at as "updatedAt", domain
    FROM lb_configs
    WHERE domain = ${domain}
    ORDER BY updated_at DESC
    LIMIT 50
    `;

  return result.rows as Array<{ version: string; status: string; updatedAt: string; domain: string }>;
}

/**
 * Delete a draft configuration
 */
export async function deleteConfig(version: string, domain: string = 'default'): Promise<boolean> {
  const result = await sql`
    DELETE FROM lb_configs 
    WHERE version = ${version} AND domain = ${domain} AND status = 'draft'
    RETURNING version
    `;

  return result.rows.length > 0;
}

// ===========================================
// BACKEND HEALTH STORAGE
// ===========================================

/**
 * Save backend health status
 */
export async function saveBackendHealth(health: BackendHealth): Promise<void> {
  const now = new Date().toISOString();

  await sql`
    INSERT INTO backend_health(backend_id, healthy, last_check, latency_p50, latency_p95, latency_p99, error_rate, consecutive_failures)
  VALUES(
    ${health.backendId},
    ${health.healthy},
    ${now},
    ${health.latencyP50 ?? null},
    ${health.latencyP95 ?? null},
    ${health.latencyP99 ?? null},
    ${health.errorRate ?? null},
    ${health.consecutiveFailures}
  )
    ON CONFLICT(backend_id)
    DO UPDATE SET
  healthy = ${health.healthy},
  last_check = ${now},
  latency_p50 = ${health.latencyP50 ?? null},
  latency_p95 = ${health.latencyP95 ?? null},
  latency_p99 = ${health.latencyP99 ?? null},
  error_rate = ${health.errorRate ?? null},
  consecutive_failures = ${health.consecutiveFailures}
  `;
}

/**
 * Get health status for all backends
 */
export async function getAllBackendHealth(): Promise<BackendHealth[]> {
  const result = await sql`
  SELECT
  backend_id as "backendId",
    healthy,
    last_check as "lastCheck",
    latency_p50 as "latencyP50",
    latency_p95 as "latencyP95",
    latency_p99 as "latencyP99",
    error_rate as "errorRate",
    consecutive_failures as "consecutiveFailures"
    FROM backend_health
    `;

  return result.rows as BackendHealth[];
}

/**
 * Get health status for a specific backend
 */
export async function getBackendHealth(backendId: string): Promise<BackendHealth | null> {
  const result = await sql`
  SELECT
  backend_id as "backendId",
    healthy,
    last_check as "lastCheck",
    latency_p50 as "latencyP50",
    latency_p95 as "latencyP95",
    latency_p99 as "latencyP99",
    error_rate as "errorRate",
    consecutive_failures as "consecutiveFailures"
    FROM backend_health
    WHERE backend_id = ${backendId}
    LIMIT 1
    `;

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0] as BackendHealth;
}

// ===========================================
// REQUEST METRICS STORAGE
// ===========================================

export interface RequestMetric {
  requestId: string;
  timestamp?: string | Date; // ISO string or Date object
  decision: 'allow' | 'block' | 'challenge' | 'throttle' | 'reroute';
  path?: string;
  method?: string;
  backendId?: string;
  latencyMs?: number;
  botScore?: number;
  botBucket?: 'low' | 'medium' | 'high';
  botReason?: string; // Top triggered reason rule name
  statusCode?: number;
  domain?: string;
}

/**
 * Record a request metric
 */
export async function recordRequestMetric(metric: RequestMetric): Promise<void> {
  try {
    // Convert timestamp to ISO string if it's a Date object
    const timestamp = metric.timestamp
      ? (metric.timestamp instanceof Date ? metric.timestamp.toISOString() : metric.timestamp)
      : new Date().toISOString();

    // Normalize domain (lowercase, trim) for consistent storage and querying
    const normalizedDomain = metric.domain 
      ? metric.domain.toLowerCase().trim() 
      : 'unknown';

    // Log domain for debugging (only log occasionally to avoid spam)
    if (Math.random() < 0.01) { // Log 1% of requests
      console.log('[Metrics] Recording metric:', {
        requestId: metric.requestId,
        decision: metric.decision,
        domain: normalizedDomain,
        originalDomain: metric.domain,
      });
    }

    await sql`
      INSERT INTO request_metrics(
      request_id,
      timestamp,
      decision,
      path,
      method,
      backend_id,
      latency_ms,
      bot_score,
      bot_bucket,
      bot_reason,
      status_code,
      domain
    )
  VALUES(
    ${metric.requestId},
    ${timestamp},
    ${metric.decision},
    ${metric.path || null},
    ${metric.method || null},
    ${metric.backendId || null},
    ${metric.latencyMs || null},
    ${metric.botScore || null},
    ${metric.botBucket || null},
    ${metric.botReason || null},
    ${metric.statusCode || null},
    ${normalizedDomain}
  )
    `;
  } catch (error) {
    // Don't fail the request if metrics recording fails
    console.error('[Metrics] Failed to record metric:', error);
  }
}

/**
 * Get aggregated stats for dashboard
 * Returns stats for the last hour by default
 */
export async function getDashboardStats(hours: number = 1, domain?: string): Promise<{
  totalRequests: number;
  allowedRequests: number;
  blockedRequests: number;
  challengedRequests: number;
  throttledRequests: number;
  avgLatency: number;
  decisionDistribution: Record<string, number>;
}> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  
  // Require domain - no global queries
  if (!domain) {
    return {
      totalRequests: 0,
      allowedRequests: 0,
      blockedRequests: 0,
      challengedRequests: 0,
      throttledRequests: 0,
      avgLatency: 0,
      decisionDistribution: {},
    };
  }

  // Normalize domain (lowercase, trim) for consistent querying
  const normalizedDomain = domain.toLowerCase().trim();

  console.log('[Storage] getDashboardStats: Querying for domain:', normalizedDomain, 'since:', since);

  // Get total counts by decision
  const decisionCounts = await sql`
  SELECT
  decision,
    COUNT(*) as count,
    AVG(latency_ms) as avg_latency
    FROM request_metrics
    WHERE timestamp >= ${since} 
    AND domain = ${normalizedDomain}
    GROUP BY decision
    `;

  // Get overall stats
  const overall = await sql`
  SELECT
  COUNT(*) as total,
    AVG(latency_ms) as avg_latency
    FROM request_metrics
    WHERE timestamp >= ${since}
    AND domain = ${normalizedDomain}
  `;

  console.log('[Storage] getDashboardStats: Found', decisionCounts.rows.length, 'decision types, total:', overall.rows[0]?.total || 0);

  const total = overall.rows[0]?.total || 0;
  const avgLatency = overall.rows[0]?.avg_latency || 0;

  const decisionMap: Record<string, number> = {};
  let allowed = 0;
  let blocked = 0;
  let challenged = 0;
  let throttled = 0;

  for (const row of decisionCounts.rows) {
    const count = parseInt(row.count as string, 10);
    decisionMap[row.decision as string] = count;

    switch (row.decision) {
      case 'allow':
        allowed = count;
        break;
      case 'block':
        blocked = count;
        break;
      case 'challenge':
        challenged = count;
        break;
      case 'throttle':
        throttled = count;
        break;
    }
  }

  return {
    totalRequests: parseInt(total as string, 10),
    allowedRequests: allowed,
    blockedRequests: blocked,
    challengedRequests: challenged,
    throttledRequests: throttled,
    avgLatency: Math.round(parseFloat(avgLatency as string) || 0),
    decisionDistribution: decisionMap,
  };
}

/**
 * Get bot detection stats
 */
export async function getBotStats(hours: number = 1, domain?: string): Promise<{
  scoreBuckets: { bucket: string; count: number; percentage: number }[];
  topReasons: { rule: string; count: number; percentage: number }[];
  actions: Record<string, number>;
}> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  
  // Require domain - no global queries
  if (!domain) {
    return {
      scoreBuckets: [],
      topReasons: [],
      actions: {},
    };
  }

  // Normalize domain (lowercase, trim) for consistent querying
  const normalizedDomain = domain.toLowerCase().trim();

  // Get counts by bot bucket
  const bucketCounts = await sql`
  SELECT
  bot_bucket,
    COUNT(*) as count
    FROM request_metrics
    WHERE timestamp >= ${since} 
    AND bot_bucket IS NOT NULL
    AND domain = ${normalizedDomain}
    GROUP BY bot_bucket
    `;

  const total = bucketCounts.rows.reduce((sum, row) => sum + parseInt(row.count as string, 10), 0);

  const scoreBuckets = bucketCounts.rows.map(row => ({
    bucket: row.bot_bucket as string,
    count: parseInt(row.count as string, 10),
    percentage: total > 0 ? (parseInt(row.count as string, 10) / total) * 100 : 0,
  }));

  // Get action counts
  const actionCounts = await sql`
  SELECT
  decision,
    COUNT(*) as count
    FROM request_metrics
    WHERE timestamp >= ${since} 
    AND decision IN('block', 'challenge', 'throttle', 'allow')
    AND domain = ${normalizedDomain}
    GROUP BY decision
    `;

  const actions: Record<string, number> = {};
  for (const row of actionCounts.rows) {
    actions[row.decision as string] = parseInt(row.count as string, 10);
  }

  // Get top bot detection reasons
  const reasonCounts = await sql`
  SELECT
  bot_reason,
    COUNT(*) as count
    FROM request_metrics
    WHERE timestamp >= ${since} 
      AND bot_reason IS NOT NULL
      AND bot_reason != ''
      AND domain = ${normalizedDomain}
    GROUP BY bot_reason
    ORDER BY count DESC
    LIMIT 10
    `;

  const totalWithReasons = reasonCounts.rows.reduce((sum, row) => sum + parseInt(row.count as string, 10), 0);

  const topReasons = reasonCounts.rows.map(row => ({
    rule: row.bot_reason as string,
    count: parseInt(row.count as string, 10),
    percentage: totalWithReasons > 0 ? (parseInt(row.count as string, 10) / totalWithReasons) * 100 : 0,
  }));

  return {
    scoreBuckets,
    topReasons,
    actions,
  };
}

/**
 * Get recent requests for traffic overview
 */
export async function getRecentRequests(limit: number = 50, domain?: string): Promise<Array<{
  requestId: string;
  timestamp: string;
  decision: string;
  path: string | null;
  method: string | null;
  backendId: string | null;
  latencyMs: number | null;
  botScore: number | null;
  botBucket: string | null;
  botReason: string | null;
  statusCode: number | null;
}>> {
  // Require domain - no global queries
  if (!domain) {
    return [];
  }

  // Normalize domain (lowercase, trim) for consistent querying
  const normalizedDomain = domain.toLowerCase().trim();

  const result = await sql`
  SELECT
  request_id,
    timestamp,
    decision,
    path,
    method,
    backend_id,
    latency_ms,
    bot_score,
    bot_bucket,
    bot_reason,
    status_code
    FROM request_metrics
    WHERE domain = ${normalizedDomain}
    ORDER BY timestamp DESC
    LIMIT ${limit}
  `;

  return result.rows.map(row => ({
    requestId: row.request_id as string,
    timestamp: (row.timestamp as Date).toISOString(),
    decision: row.decision as string,
    path: row.path as string | null,
    method: row.method as string | null,
    backendId: row.backend_id as string | null,
    latencyMs: row.latency_ms as number | null,
    botScore: row.bot_score as number | null,
    botBucket: row.bot_bucket as string | null,
    botReason: row.bot_reason as string | null,
    statusCode: row.status_code as number | null,
  }));
}

/**
 * Get time-bucketed request data for the last 24 hours
 * Buckets requests into 1-minute intervals
 */
export async function getTimeBucketedRequests(domain?: string): Promise<Array<{
  time: string;
  total: number;
  allow: number;
  block: number;
  challenge: number;
  throttle: number;
}>> {
  // Require domain - no global queries
  if (!domain) {
    console.log('[Storage] getTimeBucketedRequests: No domain provided, returning empty array');
    return [];
  }

  // Normalize domain (lowercase, trim) for consistent querying
  const normalizedDomain = domain.toLowerCase().trim();
  console.log('[Storage] getTimeBucketedRequests: Querying for domain:', normalizedDomain);

  // Get data from the last 24 hours
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Query to bucket by 1-minute intervals
  const result = await sql`
  SELECT
  DATE_TRUNC('minute', timestamp) as bucket_time,
      COUNT(*) as total,
      COUNT(*) FILTER(WHERE decision = 'allow') as allow_count,
        COUNT(*) FILTER(WHERE decision = 'block') as block_count,
          COUNT(*) FILTER(WHERE decision = 'challenge') as challenge_count,
            COUNT(*) FILTER(WHERE decision = 'throttle') as throttle_count
    FROM request_metrics
    WHERE timestamp >= ${since}
    AND domain = ${normalizedDomain}
    GROUP BY bucket_time
    ORDER BY bucket_time ASC
    `;

  console.log('[Storage] getTimeBucketedRequests: Found', result.rows.length, 'buckets for domain:', normalizedDomain);

  return result.rows.map(row => ({
    time: new Date(row.bucket_time as Date).toISOString(),
    total: parseInt(row.total as string, 10),
    allow: parseInt(row.allow_count as string, 10),
    block: parseInt(row.block_count as string, 10),
    challenge: parseInt(row.challenge_count as string, 10),
    throttle: parseInt(row.throttle_count as string, 10),
  }));
}

// ===========================================
// DATABASE INITIALIZATION
// ===========================================

/**
 * Initialize database tables
 */
export async function initializeDatabase(): Promise<void> {
  // Create configs table
  await sql`
      CREATE TABLE IF NOT EXISTS lb_configs(
      id SERIAL PRIMARY KEY,
      version VARCHAR(50) NOT NULL,
      domain VARCHAR(255) NOT NULL DEFAULT 'default',
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
      config_data JSONB NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(domain, version)
    )
    `;

  // Add domain column if it doesn't exist (migration)
  try {
    await sql`ALTER TABLE lb_configs ADD COLUMN IF NOT EXISTS domain VARCHAR(255) NOT NULL DEFAULT 'default'`;
  } catch (e) {
    console.log('[DB] Config migration notice:', e);
  }

  // Create backend health table
  await sql`
    CREATE TABLE IF NOT EXISTS backend_health(
      backend_id VARCHAR(100) PRIMARY KEY,
      healthy BOOLEAN NOT NULL DEFAULT true,
      last_check TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      latency_p50 REAL,
      latency_p95 REAL,
      latency_p99 REAL,
      error_rate REAL,
      consecutive_failures INTEGER DEFAULT 0
    )
    `;

  // Create index on status for faster lookups
  await sql`
    CREATE INDEX IF NOT EXISTS idx_lb_configs_status ON lb_configs(status)
    `;
  
  // Create index on domain for faster lookups
  await sql`
    CREATE INDEX IF NOT EXISTS idx_lb_configs_domain ON lb_configs(domain)
    `;

  // Create user-domain ownership table (for multi-tenant support)
  await sql`
    CREATE TABLE IF NOT EXISTS domain_ownership(
      id SERIAL PRIMARY KEY,
      domain VARCHAR(255) NOT NULL,
      user_id VARCHAR(255) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(domain, user_id)
    )
  `;

  // Create index on user_id for faster lookups
  await sql`
    CREATE INDEX IF NOT EXISTS idx_domain_ownership_user_id ON domain_ownership(user_id)
    `;

  // Create request metrics table
  await sql`
    CREATE TABLE IF NOT EXISTS request_metrics(
      id BIGSERIAL PRIMARY KEY,
      request_id VARCHAR(100) NOT NULL,
      timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      decision VARCHAR(20) NOT NULL,
      path VARCHAR(500),
      method VARCHAR(10),
      backend_id VARCHAR(100),
      latency_ms INTEGER,
      bot_score REAL,
      bot_bucket VARCHAR(20),
      bot_reason VARCHAR(100),
      status_code INTEGER,
      domain VARCHAR(255),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;

  try {
    await sql`ALTER TABLE request_metrics ADD COLUMN IF NOT EXISTS domain VARCHAR(255)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_request_metrics_domain ON request_metrics(domain)`;
  } catch (e) {
    console.log('[DB] Metric migration notice:', e);
  }

  // Create indexes for faster queries
  await sql`
    CREATE INDEX IF NOT EXISTS idx_request_metrics_timestamp ON request_metrics(timestamp DESC)
    `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_request_metrics_decision ON request_metrics(decision)
    `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_request_metrics_backend ON request_metrics(backend_id)
    `;

  console.log('[DB] Database initialized');
}

// ===========================================
// DOMAIN OWNERSHIP MANAGEMENT
// ===========================================

/**
 * Assign domain ownership to a user
 */
export async function assignDomainToUser(domain: string, userId: string): Promise<void> {
  await sql`
    INSERT INTO domain_ownership(domain, user_id)
    VALUES(${domain}, ${userId})
    ON CONFLICT(domain, user_id) DO NOTHING
  `;
}

/**
 * Check if a user owns a domain
 */
export async function userOwnsDomain(domain: string, userId: string): Promise<boolean> {
  const result = await sql`
    SELECT 1 FROM domain_ownership
    WHERE domain = ${domain} AND user_id = ${userId}
    LIMIT 1
  `;
  return result.rows.length > 0;
}

/**
 * Get all domains owned by a user
 */
export async function getUserDomains(userId: string): Promise<string[]> {
  const result = await sql`
    SELECT domain FROM domain_ownership
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
  `;
  return result.rows.map(row => row.domain as string);
}

/**
 * Remove domain ownership (admin function)
 */
export async function removeDomainOwnership(domain: string, userId: string): Promise<boolean> {
  const result = await sql`
    DELETE FROM domain_ownership
    WHERE domain = ${domain} AND user_id = ${userId}
    RETURNING id
  `;
  return result.rows.length > 0;
}
