
import redis from '../lib/redis.js';

export class SecurityService {
    /**
     * Rate Limit Check
     * Default: 5 attempts per 5 minutes.
     * Returns allowed status and ban expiration if applicable.
     */
    async checkRateLimit(identifier: string, limit: number = 5, windowSeconds: number = 300): Promise<{ allowed: boolean; banExpires?: number }> {
        const key = `ratelimit:${identifier}`;
        const banKey = `ban:${identifier}`;

        // Check active ban
        const banTTL = await redis.ttl(banKey);
        if (banTTL > 0) {
            return { allowed: false, banExpires: banTTL };
        }

        const current = await redis.incr(key);

        if (current === 1) {
            await redis.expire(key, windowSeconds);
        }

        if (current > limit) {
            // Exponential Backoff: 30s * 2^(excess-1)
            const excess = current - limit;
            const power = Math.min(excess, 7); // Cap at ~1h
            const banTime = 30 * Math.pow(2, power - 1);

            await redis.set(banKey, 'banned', 'EX', banTime);
            return { allowed: false, banExpires: banTime };
        }

        return { allowed: true };
    }

    /**
     * Atomic Replay Protection
     * Uses `userId` + `timeStep` as a unique key.
     * Key: `replay:{userId}:{step}`
     * Strategy: SET NX EX 60
     */
    async checkReplay(userId: string): Promise<boolean> {
        // Current 30s step
        const step = Math.floor(Date.now() / 1000 / 30);
        const key = `replay:${userId}:${step}`;

        // Atomic Check-and-Set
        const result = await redis.set(key, '1', 'EX', 60, 'NX');

        return result === 'OK';
    }
}

export const securityService = new SecurityService();
