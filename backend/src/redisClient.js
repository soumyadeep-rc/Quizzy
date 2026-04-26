const Redis = require('ioredis');

// Use the cloud URL if it exists, otherwise fallback to local Docker
const redisUrl = process.env.REDIS_URL || 'redis://quiz_redis:6379';

const redis = new Redis(redisUrl);

redis.on('connect', () => console.log('✅ Connected to Redis Database successfully!'));
redis.on('error', (err) => console.error('❌ Redis Connection Error:', err));

module.exports = redis;