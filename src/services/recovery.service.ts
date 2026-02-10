
import bcrypt from 'bcryptjs';
import redis from '../lib/redis.js';
import { logger } from '../lib/logger.js';

export class RecoveryService {
    /**
     * Hasheia e salva os códigos de recuperação no Redis.
     * Estrutura: Set redis `recovery:{user}` com os hashes.
     * Usamos Set para garantir unicidade e facilitar remoção.
     */
    async saveRecoveryCodes(user: string, codes: string[]): Promise<void> {
        const key = `recovery:${user}`;

        // Deleta códigos antigos se houver (reset)
        await redis.del(key);

        // Hash each code and push to Redis set
        // Em produção real, faríamos Promise.all para performance, 
        // mas sequencial aqui garante ordem de log se necessário.
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
     * Tenta validar um código de recuperação.
     * Se válido, REMOVE o código do set (uso único).
     * Custo: O(N) onde N é número de códigos (max 10), pois precisamos comparar o input com cada hash.
     * Como N é muito pequeno, a performance é desprezível.
     */
    async validateAndConsumeCode(user: string, inputCode: string): Promise<boolean> {
        const key = `recovery:${user}`;
        const hashes = await redis.smembers(key);

        if (hashes.length === 0) return false;

        for (const hash of hashes) {
            const match = await bcrypt.compare(inputCode, hash);
            if (match) {
                // Código válido! Remover este hash do set para impedir reuso
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
