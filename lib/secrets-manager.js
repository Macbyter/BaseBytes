/**
 * Secure Secrets Manager
 * Provides secure access to secrets from environment or secret stores
 */

/**
 * Get a secret from environment or secret store
 * @param {string} key - Secret key
 * @param {Object} options - Options
 * @returns {Promise<string|null>} - Secret value or null
 */
async function getSecret(key, options = {}) {
  const {
    required = false,
    redactLog = true
  } = options;
  
  // Check environment variable first
  const envValue = process.env[key];
  
  if (envValue) {
    // SECURITY FIX: Never log sensitive values in production
    if (process.env.NODE_ENV === 'production' && redactLog) {
      console.log(`✓ Loaded secret: ${key} [REDACTED]`);
    } else if (process.env.NODE_ENV !== 'production') {
      // In development, log first/last 4 chars for debugging
      const masked = maskSecret(envValue);
      console.log(`✓ Loaded secret: ${key} = ${masked}`);
    }
    return envValue;
  }
  
  // TODO: Add AWS Secrets Manager integration
  // TODO: Add HashiCorp Vault integration
  // TODO: Add Google Secret Manager integration
  
  if (required) {
    throw new Error(`Required secret not found: ${key}`);
  }
  
  return null;
}

/**
 * Mask a secret for logging (show first/last 4 chars)
 * @param {string} secret - Secret to mask
 * @returns {string} - Masked secret
 */
function maskSecret(secret) {
  if (!secret || secret.length < 12) {
    return '[REDACTED]';
  }
  
  const first = secret.slice(0, 4);
  const last = secret.slice(-4);
  const middle = '*'.repeat(Math.min(secret.length - 8, 20));
  
  return `${first}${middle}${last}`;
}

/**
 * Validate that required secrets are set
 * @param {string[]} keys - Required secret keys
 * @throws {Error} - If any required secret is missing
 */
async function validateRequiredSecrets(keys) {
  const missing = [];
  
  for (const key of keys) {
    const value = await getSecret(key, { required: false });
    if (!value) {
      missing.push(key);
    }
  }
  
  if (missing.length > 0) {
    throw new Error(`Missing required secrets: ${missing.join(', ')}`);
  }
}

/**
 * Get database connection string with secure handling
 * @returns {Promise<string>} - Database URL
 */
async function getDatabaseUrl() {
  return await getSecret('DATABASE_URL', { required: true });
}

/**
 * Get private key with secure handling
 * @param {string} keyName - Environment variable name
 * @returns {Promise<string>} - Private key
 */
async function getPrivateKey(keyName = 'PRIVATE_KEY') {
  const key = await getSecret(keyName, { required: true });
  
  // Validate private key format
  if (!key.startsWith('0x') || key.length !== 66) {
    throw new Error(`Invalid private key format for ${keyName}`);
  }
  
  return key;
}

module.exports = {
  getSecret,
  maskSecret,
  validateRequiredSecrets,
  getDatabaseUrl,
  getPrivateKey
};
