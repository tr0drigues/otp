
import { Redis } from 'ioredis';
import { config } from '../config.js';

const redis = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    retryStrategy: (times: number) => {
        // Linear backoff up to 2s
        const delay = Math.min(times * 50, 2000);
        return delay;
    },
});

redis.on('error', (err: any) => {
    console.error('Redis Error:', err);
});

redis.on('connect', () => {
    if (!config.env.isProduction) {
        console.log('Redis Connected');
    }
});

export default redis;
