
import { totpService } from '../src/services/totp.service.js';
import { authenticator } from 'otplib';
import { encryptionService } from '../src/services/encryption.service.js';
import redis from '../src/lib/redis.js';

async function simulateSetupFlow() {
    console.log('--- Simulating Setup & Login Flow ---');
    const user = 'safari-test-user';
    const cleanToken = (token: string) => token.replace(/\s/g, '');

    try {
        // 1. Setup (Server Side)
        console.log('1. Server generates secret...');
        const secret = totpService.generateSecret();
        console.log('   Secret:', secret);

        // Encrypt and store
        const encryptedSecret = encryptionService.encrypt(secret);
        await redis.hset(`user:${user}`, { secret: encryptedSecret });
        console.log('   Stored encrypted secret in Redis.');

        // 2. Client Side (Authenticator App Simulation)
        console.log('2. Client generates token (Authenticator App)...');
        const token = authenticator.generate(secret);
        console.log('   Token generated:', token);

        // 3. Verification (Server Side - Login)
        console.log('3. Server verifies token...');

        // Retrieve and decrypt
        const userData = await redis.hgetall(`user:${user}`);
        if (!userData || !userData.secret) throw new Error('User not found in Redis');

        const decryptedSecret = encryptionService.decrypt(userData.secret);
        if (decryptedSecret !== secret) throw new Error('Decryption mismatch!');

        // Check token
        const isValid = totpService.verifyToken(token, decryptedSecret);
        console.log(`   Verification Result: ${isValid ? '✅ VALID' : '❌ INVALID'}`);

        if (!isValid) {
            // Debugging Info
            const serverToken = authenticator.generate(decryptedSecret);
            console.error('   [DEBUG] Server expected:', serverToken);
            console.error('   [DEBUG] Delta:', authenticator.checkDelta(token, decryptedSecret));
        }

    } catch (error) {
        console.error('❌ Flow Failed:', error);
    } finally {
        await redis.quit();
        process.exit(0);
    }
}

simulateSetupFlow();
