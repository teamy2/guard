import { sql } from '@vercel/postgres';
import type { GlobalConfig, BackendHealth } from './schema';
import { GlobalConfigSchema, createDefaultConfig } from './schema';

/**
 * Get the active configuration from the database
 */
export async function getActiveConfig(): Promise<GlobalConfig> {
  try {
    const result = await sql`
      SELECT config_data FROM lb_configs 
      WHERE status = 'active' 
      ORDER BY updated_at DESC 
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

  await sql`
    INSERT INTO lb_configs (version, status, config_data, created_at, updated_at)
    VALUES (${config.version}, ${config.status}, ${JSON.stringify(configData)}, ${now}, ${now})
    ON CONFLICT (version) 
    DO UPDATE SET 
      status = ${config.status},
      config_data = ${JSON.stringify(configData)},
      updated_at = ${now}
  `;
}

/**
 * Activate a draft configuration
 */
export async function activateConfig(version: string): Promise<void> {
  // Deactivate all other configs
  await sql`
    UPDATE lb_configs SET status = 'draft' WHERE status = 'active'
  `;

  // Activate the specified version
  await sql`
    UPDATE lb_configs SET status = 'active', updated_at = NOW()
    WHERE version = ${version}
  `;
}

/**
 * Get all config versions
 */
export async function listConfigs(): Promise<Array<{ version: string; status: string; updatedAt: string }>> {
  const result = await sql`
    SELECT version, status, updated_at as "updatedAt"
    FROM lb_configs
    ORDER BY updated_at DESC
    LIMIT 50
  `;

  return result.rows as Array<{ version: string; status: string; updatedAt: string }>;
}

/**
 * Delete a draft configuration
 */
export async function deleteConfig(version: string): Promise<boolean> {
  const result = await sql`
    DELETE FROM lb_configs 
    WHERE version = ${version} AND status = 'draft'
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
    INSERT INTO backend_health (backend_id, healthy, last_check, latency_p50, latency_p95, latency_p99, error_rate, consecutive_failures)
    VALUES (
      ${health.backendId}, 
      ${health.healthy}, 
      ${now},
      ${health.latencyP50 ?? null},
      ${health.latencyP95 ?? null},
      ${health.latencyP99 ?? null},
      ${health.errorRate ?? null},
      ${health.consecutiveFailures}
    )
    ON CONFLICT (backend_id)
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
  statusCode?: number;
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

    await sql`
      INSERT INTO request_metrics (
        request_id,
        timestamp,
        decision,
        path,
        method,
        backend_id,
        latency_ms,
        bot_score,
        bot_bucket,
        status_code
      )
      VALUES (
        ${metric.requestId},
        ${timestamp},
        ${metric.decision},
        ${metric.path || null},
        ${metric.method || null},
        ${metric.backendId || null},
        ${metric.latencyMs || null},
        ${metric.botScore || null},
        ${metric.botBucket || null},
        ${metric.statusCode || null}
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
export async function getDashboardStats(hours: number = 1): Promise<{
  totalRequests: number;
  allowedRequests: number;
  blockedRequests: number;
  challengedRequests: number;
  throttledRequests: number;
  avgLatency: number;
  decisionDistribution: Record<string, number>;
}> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  // Get total counts by decision
  const decisionCounts = await sql`
    SELECT 
      decision,
      COUNT(*) as count,
      AVG(latency_ms) as avg_latency
    FROM request_metrics
    WHERE timestamp >= ${since}
    GROUP BY decision
  `;

  // Get overall stats
  const overall = await sql`
    SELECT 
      COUNT(*) as total,
      AVG(latency_ms) as avg_latency
    FROM request_metrics
    WHERE timestamp >= ${since}
  `;

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
export async function getBotStats(hours: number = 1): Promise<{
  scoreBuckets: { bucket: string; count: number; percentage: number }[];
  topReasons: { rule: string; count: number; percentage: number }[];
  actions: Record<string, number>;
}> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  // Get counts by bot bucket
  const bucketCounts = await sql`
    SELECT 
      bot_bucket,
      COUNT(*) as count
    FROM request_metrics
    WHERE timestamp >= ${since} AND bot_bucket IS NOT NULL
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
    WHERE timestamp >= ${since} AND decision IN ('block', 'challenge', 'throttle')
    GROUP BY decision
  `;

  const actions: Record<string, number> = {};
  for (const row of actionCounts.rows) {
    actions[row.decision as string] = parseInt(row.count as string, 10);
  }

  // For top reasons, we'd need to store that separately or parse from other data
  // For now, return empty array
  return {
    scoreBuckets,
    topReasons: [],
    actions,
  };
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
    CREATE TABLE IF NOT EXISTS lb_configs (
      id SERIAL PRIMARY KEY,
      version VARCHAR(50) UNIQUE NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
      config_data JSONB NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;

  // Create backend health table
  await sql`
    CREATE TABLE IF NOT EXISTS backend_health (
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

  // Create request metrics table
  await sql`
    CREATE TABLE IF NOT EXISTS request_metrics (
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
      status_code INTEGER,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;

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
