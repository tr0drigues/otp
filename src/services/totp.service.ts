
import { authenticator } from 'otplib';
import QRCode from 'qrcode';

export class TotpService {

    generateSecret() {
        return authenticator.generateSecret();
    }

    getOtpAuthKey(user: string, secret: string) {
        return authenticator.keyuri(user, 'PassOTP', secret);
    }

    async generateQRCode(otpAuthKey: string): Promise<string> {
        return QRCode.toDataURL(otpAuthKey);
    }

    /**
     * Validates the token against the secret using a ±30s window.
     * Note: Replay protection is handled separately by SecurityService.
     */
    verifyToken(token: string, secret: string): boolean {
        // window: 1 allows ±30 seconds (1 step) of clock skew.
        return authenticator.check(token, secret) || authenticator.verify({ token, secret, window: 1 } as any);
    }

    generateRecoveryCodes(quantity: number = 10): string[] {
        const codes: string[] = [];
        for (let i = 0; i < quantity; i++) {
            const hex = authenticator.generateSecret(8).toUpperCase(); // ~6-8 chars
            const code = `${hex.substring(0, 4)}-${hex.substring(4, 8)}`;
            codes.push(code);
        }
        return codes;
    }
}

export const totpService = new TotpService();
