
import 'dotenv/config';
import Fastify from 'fastify';
import crypto from 'crypto';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import { totpService } from './services/totp.service.js';
import { securityService } from './services/security.service.js';
import { recoveryService } from './services/recovery.service.js';
import { webauthnService } from './services/webauthn.service.js';
import { logger } from './lib/logger.js';
import redis from './lib/redis.js';
import { encryptionService } from './services/encryption.service.js';
import fastifyCookie from '@fastify/cookie';
import fastifyHelmet from '@fastify/helmet';
import { config } from './config.js';

// Setup paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fastify = Fastify({
    logger: false, // Using custom logger
    trustProxy: true // Trust Nginx proxy for IP rate limiting
});

// Plugins
fastify.register(cors, {
    origin: (origin, cb) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return cb(null, true);

        if (config.env.isProduction) {
            const { allowedOrigins, frontendOrigin } = config.security.cors;
            if (frontendOrigin) allowedOrigins.push(frontendOrigin);

            if (allowedOrigins.includes(origin)) {
                return cb(null, true);
            }
            return cb(new Error("Not allowed by CORS"), false);
        }

        // Dev: Allow all
        return cb(null, true);
    }
});

// Enforce SESSION_SECRET in production
if (!config.security.sessionSecret) {
    console.error('FATAL: SESSION_SECRET is required.');
    process.exit(1);
}

fastify.register(fastifyHelmet, {
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:"],
            objectSrc: ["'none'"],
            baseUri: ["'none'"],
            formAction: ["'self'"],
            frameAncestors: ["'none'"],
            connectSrc: ["'self'"],
            upgradeInsecureRequests: null
        }
    },
    // Disable HSTS in development to often avoid HTTPS redirection on localhost
    hsts: config.env.isProduction ? true : { maxAge: 0 }
});

fastify.register(fastifyCookie, {
    secret: config.security.sessionSecret,
    hook: 'onRequest',
    parseOptions: {
        httpOnly: true,
        secure: config.env.isProduction,
        sameSite: 'lax',
        path: '/'
    }
});

fastify.register(fastifyStatic, {
    root: path.join(__dirname, '../public'),
    prefix: '/',
});

// Schema Validation
const SetupSchema = z.object({
    user: z.string().min(3),
});

const LoginSchema = z.object({
    user: z.string().min(3),
    token: z.string().regex(/^[0-9]{6}$|^[a-zA-Z0-9-]{9,}$/, "Invalid token format"),
});

// Helper: Create Session
async function createSession(reply: any, user: string, ip: string, userAgent: string, method: string) {
    const sessionId = crypto.randomUUID();
    const sessionKey = `session:${sessionId}`;

    await redis.set(sessionKey, JSON.stringify({ user, ip, userAgent, method, createdAt: new Date().toISOString() }), 'EX', config.redis.ttl.session);

    reply.setCookie('session', sessionId, {
        path: '/',
        httpOnly: true,
        secure: config.env.isProduction,
        sameSite: 'lax',
        maxAge: config.redis.ttl.session,
        signed: true
    });

    // Refresh User TTLs
    await redis.expire(`user:${user}`, config.redis.ttl.user);
    await redis.expire(`recovery:${user}`, config.redis.ttl.user);
    await redis.expire(`webauthn:credentials:${user}`, config.redis.ttl.user);

    return sessionId;
}

// Routes
fastify.post('/setup', async (request, reply) => {
    logger.info({ event: 'SETUP_INIT', message: 'Setup requested', meta: { ip: request.ip } });

    const { user } = SetupSchema.parse(request.body);

    const secret = totpService.generateSecret();
    const otpAuthKey = totpService.getOtpAuthKey(user, secret);
    const qrCode = await totpService.generateQRCode(otpAuthKey);
    const recoveryCodes = totpService.generateRecoveryCodes();

    const encryptedSecret = encryptionService.encrypt(secret);
    await redis.hset(`user:${user}`, { secret: encryptedSecret });

    await recoveryService.saveRecoveryCodes(user, recoveryCodes);

    // Set Expiration
    await redis.expire(`user:${user}`, config.redis.ttl.user);
    await redis.expire(`recovery:${user}`, config.redis.ttl.user);
    await redis.expire(`webauthn:credentials:${user}`, config.redis.ttl.user);

    // Security Check: Only return secret in Debug Mode with explicit confirmation
    const { allowDebugSetup, confirmsRisk } = config.security;
    const allowDebugOutput = allowDebugSetup && confirmsRisk;

    if (config.env.isProduction && !allowDebugOutput) {
        return {
            qrCode,
            recoveryCodes
        };
    }

    if (allowDebugOutput && config.env.isProduction) {
        logger.warn({ event: 'SECURITY_ALERT', message: 'Debug output enabled in PRODUCTION', meta: { user } });
    }

    return {
        secret,
        otpAuth: otpAuthKey,
        qrCode,
        recoveryCodes
    };
});

// Development Verification Endpoint
fastify.post('/verify', async (request, reply) => {
    const { enableDevVerify, confirmsRisk } = config.security;
    const isEnabled = enableDevVerify && confirmsRisk;

    if (config.env.isProduction && !isEnabled) {
        return reply.status(404).send({ error: 'Not Found', message: 'Endpoint disabled in production.' });
    }

    if (isEnabled && config.env.isProduction) {
        logger.warn({ event: 'SECURITY_ALERT', message: 'Verify endpoint enabled in PRODUCTION', meta: { user: (request.body as any)['user'] } });
    }

    const { token, secret } = request.body as any;

    if (!token || !secret) {
        return reply.status(400).send({ success: false, message: 'Token and Secret are required.' });
    }

    const isValid = totpService.verifyToken(token, secret);

    if (isValid) {
        return { success: true, message: 'Code verified successfully!' };
    } else {
        return reply.status(400).send({ success: false, message: 'Invalid code.' });
    }
});

fastify.post('/login', async (request, reply) => {
    const { user, token } = LoginSchema.parse(request.body);
    const ip = request.ip;
    const userAgent = request.headers['user-agent'] || 'unknown';

    logger.info({
        event: 'AUTH_ATTEMPT',
        message: 'Login attempt',
        user, ip, userAgent
    });

    // 1. IP Rate Limit (Anti-DDoS)
    const ipLimit = await securityService.checkRateLimit(`ip:${ip}`);
    if (!ipLimit.allowed) {
        logger.warn({ event: 'RATE_LIMIT_IP', message: 'IP Rate limit exceeded', user, ip, meta: { banExpires: ipLimit.banExpires } });
        return reply.status(429).send({
            success: false,
            message: `Too many attempts. Try again in ${Math.ceil(ipLimit.banExpires!)} seconds.`
        });
    }

    // 2. User Rate Limit (Anti-Credential Stuffing)
    const userLimit = await securityService.checkRateLimit(`user:${user}`);
    if (!userLimit.allowed) {
        logger.warn({ event: 'RATE_LIMIT_USER', message: 'User Rate limit exceeded', user, ip, meta: { banExpires: userLimit.banExpires } });
        return reply.status(429).send({
            success: false,
            message: `Too many attempts for this user. Wait ${Math.ceil(userLimit.banExpires!)} seconds.`
        });
    }

    // Recovery Code Flow
    if (token.includes('-') || token.length > 6) {
        const isRecoveryValid = await recoveryService.validateAndConsumeCode(user, token);
        if (isRecoveryValid) {
            logger.warn({ event: 'RECOVERY_USE', message: 'User logged in with recovery code', user, ip });
            await createSession(reply, user, ip, userAgent, 'RECOVERY_CODE');

            return {
                success: true,
                message: 'Login successful (Recovery Code)',
                meta: {
                    method: 'RECOVERY_CODE',
                    user, ip, userAgent,
                    timestamp: new Date().toISOString()
                }
            };
        }
    }

    // 3. TOTP Flow
    const userData = await redis.hgetall(`user:${user}`);
    const GENERIC_ERROR = 'Invalid credentials.';

    if (!userData || !userData.secret) {
        logger.warn({ event: 'AUTH_FAIL', message: 'User not found', user, ip });
        // Timing attack mitigation
        await new Promise(resolve => setTimeout(resolve, 200));
        return reply.status(401).send({ success: false, message: GENERIC_ERROR });
    }

    let secret: string;
    try {
        secret = encryptionService.decrypt(userData.secret);
    } catch (e) {
        logger.error({ event: 'AUTH_FAIL', message: 'Decryption error', user });
        await new Promise(resolve => setTimeout(resolve, 200));
        return reply.status(401).send({ success: false, message: GENERIC_ERROR });
    }

    const isValid = totpService.verifyToken(token, secret);
    if (!isValid) {
        logger.warn({ event: 'AUTH_FAIL', message: 'Invalid TOTP code', user, ip });
        await new Promise(resolve => setTimeout(resolve, 200));
        return reply.status(401).send({ success: false, message: GENERIC_ERROR });
    }

    // 4. Replay Check
    const isFresh = await securityService.checkReplay(user);
    if (!isFresh) {
        logger.warn({ event: 'REPLAY_ATTACK', message: 'Replay attack detected', user, ip });
        await new Promise(resolve => setTimeout(resolve, 200));
        return reply.status(401).send({ success: false, message: GENERIC_ERROR });
    }

    await createSession(reply, user, ip, userAgent, 'TOTP_APP');

    logger.info({ event: 'AUTH_SUCCESS_TOTP', message: 'User authenticated successfully', user, ip });
    return {
        success: true,
        message: 'Login successful!',
        meta: {
            method: 'TOTP_APP',
            user, ip, userAgent,
            timestamp: new Date().toISOString()
        }
    };
});


// --- WebAuthn Routes ---

fastify.post('/webauthn/register/challenge', async (request, reply) => {
    const { user } = SetupSchema.parse(request.body);
    const ip = request.ip;

    const ipLimit = await securityService.checkRateLimit(`ip:${ip}`);
    if (!ipLimit.allowed) {
        return reply.status(429).send({ success: false, message: 'Too many attempts.' });
    }

    const options = await webauthnService.generateRegisterOptions(user);
    return options;
});

fastify.post('/webauthn/register/verify', async (request, reply) => {
    const { user, ...body } = request.body as any;
    const ip = request.ip;

    const ipLimit = await securityService.checkRateLimit(`ip:${ip}`);
    if (!ipLimit.allowed) {
        return reply.status(429).send({ success: false, message: 'Too many attempts.' });
    }

    try {
        const success = await webauthnService.verifyRegister(user, body);
        return { success, message: success ? 'Passkey saved!' : 'Failed to save Passkey.' };
    } catch (err: any) {
        reply.status(400);
        return { success: false, message: err.message };
    }
});

fastify.post('/webauthn/login/challenge', async (request, reply) => {
    const { user } = SetupSchema.parse(request.body);
    const ip = request.ip;

    const ipLimit = await securityService.checkRateLimit(`ip:${ip}`);
    if (!ipLimit.allowed) {
        logger.warn({ event: 'RATE_LIMIT_IP', message: 'WebAuthn Challenge Rate limit', user, ip });
        return reply.status(429).send({ success: false, message: 'Too many attempts.' });
    }
    try {
        const options = await webauthnService.generateLoginOptions(user);
        return options;
    } catch (err: any) {
        // Fallthrough
    }
});

fastify.post('/webauthn/login/verify', async (request, reply) => {
    const { user, ...body } = request.body as any;
    const ip = request.ip;
    const userAgent = request.headers['user-agent'] || 'unknown';

    const ipLimit = await securityService.checkRateLimit(`ip:${ip}`);
    const userLimit = await securityService.checkRateLimit(`user:${user}`);

    if (!ipLimit.allowed || !userLimit.allowed) {
        logger.warn({ event: 'RATE_LIMIT_IP', message: 'WebAuthn Verify Rate limit', user, ip });
        return reply.status(429).send({ success: false, message: 'Too many attempts.' });
    }

    try {
        const success = await webauthnService.verifyLogin(user, body);
        if (success) {
            await createSession(reply, user, ip, userAgent, 'WEBAUTHN_PASSKEY');

            logger.info({ event: 'AUTH_SUCCESS_WEBAUTHN', message: 'User authenticated via WebAuthn', user, ip });
            return {
                success: true,
                message: 'Login with Passkey successful!',
                meta: {
                    method: 'WEBAUTHN_PASSKEY',
                    user, ip, userAgent,
                    timestamp: new Date().toISOString()
                }
            };
        }
        return reply.status(401).send({ success: false, message: 'Passkey validation failed.' });
    } catch (err: any) {
        logger.warn({ event: 'AUTH_FAIL', message: 'WebAuthn logic error', user, ip, meta: { error: err.message } });
        return reply.status(400).send({ success: false, message: err.message });
    }
});

const start = async () => {
    try {
        await fastify.listen({ port: config.env.port, host: config.env.host });
        logger.info({ event: 'SYSTEM_START', message: `Server running at http://localhost:${config.env.port}` });
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

start();
