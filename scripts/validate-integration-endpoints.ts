
import { authenticator } from 'otplib';

const BASE_URL = 'http://localhost';
const TEST_USER = `integration-test-${Date.now()}@example.com`;

async function main() {
    console.log(`🔌 Iniciando Validação de Integração para: ${TEST_USER}\n`);

    try {
        // 1. SETUP (Backend-to-Backend)
        console.log('[1] Chamando POST /setup...');
        const setupRes = await fetch(`${BASE_URL}/setup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user: TEST_USER })
        });

        if (!setupRes.ok) throw new Error(`Setup falhou: ${setupRes.status} ${setupRes.statusText}`);
        const setupData = await setupRes.json() as any;

        if (!setupData.secret || !setupData.qrCode) {
            throw new Error('Resposta do /setup incompleta (faltando secret ou qrCode)');
        }
        console.log('✅ /setup OK.');
        console.log(`   Secret recebido: ${setupData.secret.substring(0, 4)}...`);
        console.log(`   Recovery Codes: ${setupData.recoveryCodes.length}`);

        // 2. VERIFY (Backend-to-Backend)
        // O Backend "Consumidor" gera o token (simulando o App do usuário)
        // Para isso, precisamos gerar um token válido agora.

        console.log('[2] Gerando Token TOTP válido...');
        const token = authenticator.generate(setupData.secret);
        console.log(`   Token gerado: ${token}`);

        console.log('[3] Chamando POST /verify...');
        const verifyRes = await fetch(`${BASE_URL}/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user: TEST_USER,
                token: token,
                secret: setupData.secret // Enviando o segredo que acabamos de receber
            })
        });

        const verifyData = await verifyRes.json() as any;

        if (verifyRes.ok && verifyData.success) {
            console.log('✅ /verify OK. Token validado com sucesso!');
        } else {
            throw new Error(`Validação falhou: ${JSON.stringify(verifyData)}`);
        }

        // 3. FALHA ESPERADA
        console.log('[4] Testando Token Inválido...');
        const failRes = await fetch(`${BASE_URL}/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user: TEST_USER,
                token: '000000',
                secret: setupData.secret
            })
        });

        if (failRes.status === 400 || failRes.status === 401) {
            console.log('✅ Falha esperada OK (Token incorreto rejeitado).');
        } else {
            console.warn('⚠️  Aviso: Token inválido não retornou 400/401.');
        }

        console.log('\n🎉 SUCESSO! Todos os endpoints de integração funcionam conforme a arquitetura.');

    } catch (error) {
        console.error('❌ Erro na validação:', error);
        process.exit(1);
    }
}

main();
