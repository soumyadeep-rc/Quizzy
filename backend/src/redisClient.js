const Redis = require('ioredis');

// Connect using the URL provided by Docker Compose
const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const redis = new Redis(redisUrl);

redis.on('connect', () => {
    console.log('✅ Connected to Redis Database successfully!');
});

redis.on('error', (err) => {
    console.error('❌ Redis connection error:', err);
});

module.exports = redis;