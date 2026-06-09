import Queue from 'bull';
import redis from 'redis';

const redisClient = redis.createClient({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
});

redisClient.on('error', (err) => {
  // Silenciar errores de conexión en desarrollo
  if (process.env.NODE_ENV !== 'production') {
    // Ignorar en desarrollo
    return;
  }
  console.error('Redis client error:', err);
});

const integrationSyncQueue = new Queue('integration-sync', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: true,
  },
});

integrationSyncQueue.on('error', (err) => {
  if (!process.env.REDIS_URL) return; // Redis opcional — sin URL, ignorar errores
  console.error('Queue error:', err);
});

integrationSyncQueue.on('completed', (job) => {
  console.log(`✅ Job ${job.id} completed:`, job.data);
});

integrationSyncQueue.on('failed', (job, err) => {
  console.error(`❌ Job ${job.id} failed:`, err.message);
});

export { integrationSyncQueue, redisClient };
