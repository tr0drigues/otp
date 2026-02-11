
import bcrypt from 'bcryptjs';
import redis from '../lib/redis.js';
import { logger } from '../lib/logger.js';

export class RecoveryService {
    /**
     * Hashes and saves recovery codes in Redis.
     * Structure: Redis Set `recovery:{user}` containing hashes.
     * Sets ensure uniqueness and efficient removal.
     */
    async saveRecoveryCodes(user: string, codes: string[]): Promise<void> {
        const key = `recovery:${user}`;

        // Reset existing codes
        await redis.del(key);

        // Hash each code sequentially and add to Redis
        for (const code of codes) {
            const hash = await bcrypt.hash(code, 10);
            await redis.sadd(key, hash);
        }

        logger.info({
            event: 'SETUP_COMPLETE',
            user,
            message: `Generated and secured ${codes.length} recovery codes`
        });
    }

    /**
     * Attempts to validate a recovery code.
     * Usage consumes the code (single use).
     */
    async validateAndConsumeCode(user: string, inputCode: string): Promise<boolean> {
        const key = `recovery:${user}`;
        const hashes = await redis.smembers(key);

        if (hashes.length === 0) return false;

        for (const hash of hashes) {
            const match = await bcrypt.compare(inputCode, hash);
            if (match) {
                // Code matches; remove from set to invalidate
                await redis.srem(key, hash);

                logger.warn({
                    event: 'RECOVERY_USE',
                    user,
                    message: 'Recovery code used successfully. Code invalidated.'
                });

                return true;
            }
        }

        return false;
    }
}

export const recoveryService = new RecoveryService();
