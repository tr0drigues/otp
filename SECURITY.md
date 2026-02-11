# Security Policy

## Threat Model
PassOTP is designed to defend against specific attack vectors targeting authentication systems.

### 1. Brute Force & Credential Stuffing
- **Defense**: Dual-layer rate limiting.
    - **IP-based**: Throttles bursts from single sources (DDoS mitigation).
    - **User-based**: Throttles attempts on specific accounts (Credential stuffing mitigation).

### 2. Replay Attacks
- **Risk**: An attacker intercepts a valid TOTP code and reuses it.
- **Defense**: Atomic `SET NX` operations in Redis ensure a code can only be consumed once within its validity window.

### 3. Account Enumeration
- **Risk**: Attackers determining valid users via error messages.
- **Defense**: Generic error messages ("Invalid credentials") and constant-time delays (approx. 200ms) on failed authentication attempts.

### 4. Data Leaks (Redis Compromise)
- **Risk**: Attacker gains read access to the Redis database.
- **Defense**: TOTP secrets are encrypted at-rest using **AES-256-GCM**.
    - **Key Management**: Encryption key is injected via environment variables (`ENCRYPTION_KEY`).
    - **Outcome**: Attacker sees only ciphertext without the key.

## Misuse Cases (What to Avoid)
- **Do NOT** expose the Redis instance to the public internet.
- **Do NOT** run in production without HTTPS (Secure Cookies will fail).
- **Do NOT** enable `ALLOW_DEBUG_SETUP_OUTPUT` in production environments.

## Reporting Vulnerabilities
If you discover a security vulnerability, please send an email to the maintainers or open a private advisory on GitHub. We aim to acknowledge reports within 48 hours.
