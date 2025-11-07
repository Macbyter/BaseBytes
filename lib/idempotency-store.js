/**
 * Idempotency Store
 * Provides race-condition-safe idempotency using Redis or PostgreSQL
 */

const fs = require('fs');
const path = require('path');

/**
 * Idempotency store interface
 */
class IdempotencyStore {
  /**
   * Check if a key exists
   * @param {string} key - Idempotency key
   * @returns {Promise<Object|null>} - Stored value or null
   */
  async get(key) {
    throw new Error('Not implemented');
  }
  
  /**
   * Set a key with value
   * @param {string} key - Idempotency key
   * @param {Object} value - Value to store
   * @param {number} ttl - Time to live in seconds
   * @returns {Promise<boolean>} - True if set, false if already exists
   */
  async set(key, value, ttl = 86400) {
    throw new Error('Not implemented');
  }
  
  /**
   * Delete a key
   * @param {string} key - Idempotency key
   * @returns {Promise<boolean>} - True if deleted
   */
  async delete(key) {
    throw new Error('Not implemented');
  }
}

/**
 * Redis-based idempotency store (recommended for production)
 */
class RedisIdempotencyStore extends IdempotencyStore {
  constructor(redisClient) {
    super();
    this.redis = redisClient;
  }
  
  async get(key) {
    const value = await this.redis.get(`idem:${key}`);
    return value ? JSON.parse(value) : null;
  }
  
  async set(key, value, ttl = 86400) {
    const result = await this.redis.set(
      `idem:${key}`,
      JSON.stringify(value),
      'EX', ttl,
      'NX' // Only set if not exists
    );
    return result === 'OK';
  }
  
  async delete(key) {
    const result = await this.redis.del(`idem:${key}`);
    return result === 1;
  }
}

/**
 * PostgreSQL-based idempotency store
 */
class PostgresIdempotencyStore extends IdempotencyStore {
  constructor(pool) {
    super();
    this.pool = pool;
  }
  
  async get(key) {
    const result = await this.pool.query(
      'SELECT value FROM idempotency_keys WHERE key = $1 AND expires_at > NOW()',
      [key]
    );
    return result.rows[0]?.value || null;
  }
  
  async set(key, value, ttl = 86400) {
    try {
      await this.pool.query(
        `INSERT INTO idempotency_keys (key, value, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '${ttl} seconds')
         ON CONFLICT (key) DO NOTHING`,
        [key, value]
      );
      return true;
    } catch (e) {
      return false;
    }
  }
  
  async delete(key) {
    const result = await this.pool.query(
      'DELETE FROM idempotency_keys WHERE key = $1',
      [key]
    );
    return result.rowCount > 0;
  }
}

/**
 * Filesystem-based idempotency store (development only)
 * WARNING: Prone to race conditions, not recommended for production
 */
class FilesystemIdempotencyStore extends IdempotencyStore {
  constructor(dir = './diagnostics') {
    super();
    this.dir = dir;
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (e) {
      // Ignore if exists
    }
  }
  
  async get(key) {
    const filepath = path.join(this.dir, `idem_${key}.json`);
    if (!fs.existsSync(filepath)) {
      return null;
    }
    
    try {
      const content = fs.readFileSync(filepath, 'utf8');
      const data = JSON.parse(content);
      
      // Check expiry
      if (data.expiresAt && new Date(data.expiresAt) < new Date()) {
        fs.unlinkSync(filepath);
        return null;
      }
      
      return data.value;
    } catch (e) {
      return null;
    }
  }
  
  async set(key, value, ttl = 86400) {
    const filepath = path.join(this.dir, `idem_${key}.json`);
    
    // Check if already exists (race condition possible)
    if (fs.existsSync(filepath)) {
      return false;
    }
    
    const data = {
      value,
      expiresAt: new Date(Date.now() + ttl * 1000).toISOString()
    };
    
    try {
      fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
      return true;
    } catch (e) {
      return false;
    }
  }
  
  async delete(key) {
    const filepath = path.join(this.dir, `idem_${key}.json`);
    try {
      fs.unlinkSync(filepath);
      return true;
    } catch (e) {
      return false;
    }
  }
}

/**
 * Create an idempotency store based on environment
 * @param {Object} options - Options
 * @returns {IdempotencyStore} - Idempotency store instance
 */
function createIdempotencyStore(options = {}) {
  const { redis, postgres, filesystem } = options;
  
  if (redis) {
    return new RedisIdempotencyStore(redis);
  }
  
  if (postgres) {
    return new PostgresIdempotencyStore(postgres);
  }
  
  if (filesystem || process.env.NODE_ENV === 'development') {
    console.warn('⚠️  WARNING: Using filesystem-based idempotency store. Not recommended for production.');
    return new FilesystemIdempotencyStore(filesystem);
  }
  
  throw new Error('No idempotency store configured');
}

module.exports = {
  IdempotencyStore,
  RedisIdempotencyStore,
  PostgresIdempotencyStore,
  FilesystemIdempotencyStore,
  createIdempotencyStore
};
