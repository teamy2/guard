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

  console.log('[DB] Database initialized');
}
