
import {
    generateRegistrationOptions,
    verifyRegistrationResponse,
    generateAuthenticationOptions,
    verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { logger } from '../lib/logger.js';
import redis from '../lib/redis.js';
import { config } from '../config.js';

const { rpId, rpName, origin, requireUv } = config.webauthn;

export class WebAuthnService {

    /**
     * 1. REGISTRATION: Generate Options (Challenge)
     */
    async generateRegisterOptions(user: string) {
        const userCredentials = await this.getUserCredentials(user);

        const options = await generateRegistrationOptions({
            rpName: rpName,
            rpID: rpId,
            userName: user,
            // RFC 8812: COSE Algorithms (ES256, RS256, EdDSA)
            supportedAlgorithmIDs: [-7, -257, -8],
            excludeCredentials: userCredentials.map(cred => ({
                id: cred.id,
                transports: cred.transports,
            })),
            authenticatorSelection: {
                residentKey: 'preferred',
                userVerification: requireUv ? 'required' : 'preferred',
            },
        });

        // Store challenge (TTL 60s)
        await redis.set(`webauthn:challenge:${user}`, options.challenge, 'EX', config.redis.ttl.temp);

        return options;
    }

    /**
     * 2. REGISTRATION: Verify Response
     */
    async verifyRegister(user: string, body: any) {
        const expectedChallenge = await redis.get(`webauthn:challenge:${user}`);

        if (!expectedChallenge) {
            throw new Error('Challenge expired or not found.');
        }

        let verification;
        try {
            verification = await verifyRegistrationResponse({
                response: body,
                expectedChallenge,
                expectedOrigin: origin,
                expectedRPID: rpId,
                requireUserVerification: requireUv,
            });
        } catch (error) {
            logger.error({ event: 'AUTH_FAIL', message: 'WebAuthn verification failed (Register)', user, meta: { error } });
            throw error;
        }

        const { verified, registrationInfo } = verification;

        if (verified && registrationInfo) {
            const { credential } = registrationInfo;
            const { id, publicKey, counter } = credential;

            const newCredential = {
                id,
                publicKey,
                counter,
                transports: body.response.transports,
            };

            await this.saveCredential(user, newCredential);
            await redis.del(`webauthn:challenge:${user}`);

            logger.info({ event: 'SETUP_COMPLETE', message: 'Passkey registered successfully', user });

            // Refresh TTL
            await redis.expire(`webauthn:credentials:${user}`, config.redis.ttl.user);
            await redis.expire(`user:${user}`, config.redis.ttl.user);

            return true;
        }

        return false;
    }

    /**
     * 3. LOGIN: Generate Options (Challenge)
     */
    async generateLoginOptions(user: string) {
        const userCredentials = await this.getUserCredentials(user);

        const options = await generateAuthenticationOptions({
            rpID: rpId,
            allowCredentials: userCredentials.map(cred => ({
                id: cred.id,
                transports: cred.transports,
            })),
            userVerification: requireUv ? 'required' : 'preferred',
        });

        await redis.set(`webauthn:challenge:${user}`, options.challenge, 'EX', config.redis.ttl.temp);

        return options;
    }

    /**
     * 4. LOGIN: Verify Response
     */
    async verifyLogin(user: string, body: any) {
        const expectedChallenge = await redis.get(`webauthn:challenge:${user}`);
        const userCredentials = await this.getUserCredentials(user);

        const credentialObj = userCredentials.find(cred => cred.id === body.id);

        if (!expectedChallenge || !credentialObj) {
            throw new Error('Invalid challenge or credential not found.');
        }

        let verification;
        try {
            verification = await verifyAuthenticationResponse({
                response: body,
                expectedChallenge,
                expectedOrigin: origin,
                expectedRPID: rpId,
                credential: {
                    id: credentialObj.id,
                    publicKey: new Uint8Array(Object.values(credentialObj.publicKey)),
                    counter: credentialObj.counter,
                    transports: credentialObj.transports,
                },
                requireUserVerification: requireUv,
            });
        } catch (error) {
            logger.error({ event: 'AUTH_FAIL', message: 'WebAuthn verification failed (Login)', user, meta: { error } });
            throw error;
        }

        const { verified, authenticationInfo } = verification;

        if (verified) {
            // Update counter to prevent cloning
            credentialObj.counter = authenticationInfo.newCounter;
            await this.updateCredential(user, credentialObj);

            await redis.del(`webauthn:challenge:${user}`);

            // Refresh TTL
            await redis.expire(`webauthn:credentials:${user}`, config.redis.ttl.user);
            await redis.expire(`user:${user}`, config.redis.ttl.user);
            await redis.expire(`recovery:${user}`, config.redis.ttl.user);

            return true;
        }

        return false;
    }

    // --- Persistence Helpers ---

    private async getUserCredentials(user: string): Promise<any[]> {
        const data = await redis.get(`webauthn:credentials:${user}`);
        return data ? JSON.parse(data) : [];
    }

    private async saveCredential(user: string, credential: any) {
        const creds = await this.getUserCredentials(user);
        creds.push(credential);
        await redis.set(`webauthn:credentials:${user}`, JSON.stringify(creds));
    }

    private async updateCredential(user: string, updatedCred: any) {
        let creds = await this.getUserCredentials(user);
        creds = creds.map(c => c.id === updatedCred.id ? updatedCred : c);
        await redis.set(`webauthn:credentials:${user}`, JSON.stringify(creds));
    }
}

export const webauthnService = new WebAuthnService();
