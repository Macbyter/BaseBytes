// api/status.js
// Status endpoint for monitoring system health and performance

const { Pool } = require('pg');

/**
 * Calculate p95 latency from recent receipts
 * @param {Pool} pool - Database connection pool
 * @returns {Promise<number>} p95 latency in milliseconds
 */
async function getEntitlementP95(pool) {
  const result = await pool.query(`
    SELECT 
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY processing_time_ms) as p95
    FROM receipts
    WHERE created_at > NOW() - INTERVAL '24 hours'
    AND processing_time_ms IS NOT NULL
  `);
  
  return result.rows[0]?.p95 || null;
}

/**
 * Get last anchor timestamp
 * @param {Pool} pool - Database connection pool
 * @returns {Promise<string|null>} ISO timestamp of last anchor
 */
async function getLastAnchorAt(pool) {
  const result = await pool.query(`
    SELECT created_at
    FROM anchors
    ORDER BY created_at DESC
    LIMIT 1
  `);
  
  return result.rows[0]?.created_at?.toISOString() || null;
}

/**
 * Calculate receipt coverage (attested/total) in last 24h
 * @param {Pool} pool - Database connection pool
 * @returns {Promise<number>} Coverage ratio (0-1)
 */
async function getReceiptCoverage24h(pool) {
  const result = await pool.query(`
    SELECT 
      COUNT(*) FILTER (WHERE attestation_status = 'onchain') as attested,
      COUNT(*) as total
    FROM receipts
    WHERE created_at > NOW() - INTERVAL '24 hours'
  `);
  
  const { attested, total } = result.rows[0];
  return total > 0 ? parseFloat(attested) / parseFloat(total) : null;
}

/**
 * Calculate API uptime in last 7 days
 * @param {Pool} pool - Database connection pool
 * @returns {Promise<number>} Uptime percentage (0-100)
 */
async function getApiUptime7d(pool) {
  // This is a simplified implementation
  // In production, you'd track actual uptime from monitoring system
  const result = await pool.query(`
    SELECT 
      COUNT(*) FILTER (WHERE status = 'success') as success,
      COUNT(*) as total
    FROM api_logs
    WHERE created_at > NOW() - INTERVAL '7 days'
  `);
  
  if (result.rows[0]?.total > 0) {
    const { success, total } = result.rows[0];
    return (parseFloat(success) / parseFloat(total)) * 100;
  }
  
  // If no api_logs table, assume 100% uptime
  return 100;
}

/**
 * Status endpoint handler
 * @param {Request} req - Express request
 * @param {Response} res - Express response
 */
async function statusHandler(req, res) {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });
  
  try {
    const [
      entitlement_p95_ms,
      last_anchor_at,
      receipt_coverage_24h,
      api_uptime_7d
    ] = await Promise.all([
      getEntitlementP95(pool),
      getLastAnchorAt(pool),
      getReceiptCoverage24h(pool),
      getApiUptime7d(pool)
    ]);
    
    res.json({
      status: 'operational',
      timestamp: new Date().toISOString(),
      metrics: {
        entitlement_p95_ms,
        last_anchor_at,
        receipt_coverage_24h,
        api_uptime_7d
      },
      version: process.env.APP_VERSION || '0.1-testnet'
    });
  } catch (error) {
    console.error('Status endpoint error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to retrieve status metrics',
      timestamp: new Date().toISOString()
    });
  } finally {
    await pool.end();
  }
}

module.exports = { statusHandler };
