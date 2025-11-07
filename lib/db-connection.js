/**
 * Secure Database Connection Utility
 * Enforces TLS verification for PostgreSQL connections
 */

const { Pool } = require('pg');
const fs = require('fs');

/**
 * Create a secure PostgreSQL connection pool
 * @param {string} connectionString - PostgreSQL connection string
 * @param {Object} options - Additional options
 * @returns {Pool} - PostgreSQL connection pool
 */
function createSecurePool(connectionString, options = {}) {
  const config = {
    connectionString,
    ...options
  };

  // SECURITY FIX: Enforce TLS certificate validation
  // Parse connection string to check for SSL requirements
  if (connectionString.includes('sslmode=require') || process.env.NODE_ENV === 'production') {
    const caPath = process.env.DB_CA_CERT_PATH;
    
    if (caPath && fs.existsSync(caPath)) {
      // Use provided CA certificate
      config.ssl = {
        rejectUnauthorized: true,
        ca: fs.readFileSync(caPath).toString()
      };
    } else if (process.env.NODE_ENV === 'production') {
      // In production, require TLS with system CA
      config.ssl = {
        rejectUnauthorized: true
      };
    } else {
      // Development: warn but allow
      console.warn('⚠️  WARNING: DB_CA_CERT_PATH not set. TLS verification disabled for development.');
      config.ssl = {
        rejectUnauthorized: false
      };
    }
  }

  return new Pool(config);
}

module.exports = {
  createSecurePool
};
