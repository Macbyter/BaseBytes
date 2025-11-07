/**
 * Secure Diagnostics Utility
 * Redacts sensitive fields before writing diagnostic files
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Redact sensitive fields from an object
 * @param {Object} data - Data to redact
 * @returns {Object} - Redacted data
 */
function redactSensitiveFields(data) {
  const redacted = { ...data };
  
  // Redact PII and sensitive fields
  const sensitiveFields = [
    'subject',
    'privacy',
    'features',
    'to',
    'receiptUid',
    'idempotencyKey',
    'signerKey',
    'privateKey'
  ];
  
  for (const field of sensitiveFields) {
    if (field in redacted) {
      if (typeof redacted[field] === 'string') {
        // Hash the value for debugging while preserving privacy
        const hash = crypto.createHash('sha256').update(redacted[field]).digest('hex').slice(0, 8);
        redacted[field] = `[REDACTED:${hash}]`;
      } else if (typeof redacted[field] === 'object') {
        redacted[field] = '[REDACTED:OBJECT]';
      }
    }
  }
  
  return redacted;
}

/**
 * Write diagnostic file with security controls
 * @param {string} filename - Filename (without path)
 * @param {Object} data - Data to write
 * @param {Object} options - Options
 */
function writeDiagnostic(filename, data, options = {}) {
  const {
    redact = true,
    maxAge = 7 * 24 * 60 * 60 * 1000, // 7 days default
    encrypt = false
  } = options;
  
  // SECURITY FIX: Only write diagnostics in development
  if (process.env.NODE_ENV === 'production') {
    // In production, use structured logging instead
    const logger = options.logger || console;
    logger.info('diagnostic', redact ? redactSensitiveFields(data) : data);
    return { kind: 'logged' };
  }
  
  const dir = path.join(process.cwd(), 'diagnostics');
  
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (e) {
    // Ignore if directory already exists
  }
  
  const filepath = path.join(dir, filename);
  
  // Redact sensitive fields
  const outputData = redact ? redactSensitiveFields(data) : data;
  
  // Write file
  fs.writeFileSync(filepath, JSON.stringify(outputData, null, 2));
  
  // Schedule cleanup (in production, this would be a cron job)
  if (maxAge > 0) {
    setTimeout(() => {
      try {
        const stats = fs.statSync(filepath);
        const age = Date.now() - stats.mtimeMs;
        if (age > maxAge) {
          fs.unlinkSync(filepath);
        }
      } catch (e) {
        // File may have been deleted already
      }
    }, maxAge);
  }
  
  return { kind: 'file', file: filepath };
}

/**
 * Clean up old diagnostic files
 * @param {number} maxAge - Maximum age in milliseconds
 */
function cleanupDiagnostics(maxAge = 7 * 24 * 60 * 60 * 1000) {
  const dir = path.join(process.cwd(), 'diagnostics');
  
  if (!fs.existsSync(dir)) {
    return;
  }
  
  const files = fs.readdirSync(dir);
  let cleaned = 0;
  
  for (const file of files) {
    const filepath = path.join(dir, file);
    try {
      const stats = fs.statSync(filepath);
      const age = Date.now() - stats.mtimeMs;
      
      if (age > maxAge) {
        fs.unlinkSync(filepath);
        cleaned++;
      }
    } catch (e) {
      // Ignore errors
    }
  }
  
  return cleaned;
}

module.exports = {
  redactSensitiveFields,
  writeDiagnostic,
  cleanupDiagnostics
};
