
import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:3000';
const USER = `recovery-test-${Date.now()}@test.com`;

async function main() {
    console.log('🧪 INICIANDO TESTE DE RECOVERY CODES\n');

    const browser = await chromium.launch();
    const page = await browser.newPage();

    // 1. Setup
    console.log('[1] Configurando conta...');
    await page.goto(`${BASE_URL}/`);
    await page.fill('#username', USER);
    await page.click('#btnSetup');
    await page.waitForSelector('#recoverySection', { state: 'visible' });

    // Capturar códigos
    const codesText = await page.textContent('#recoveryCodesList');
    const codes = codesText?.match(/[A-Z0-9]{4}-[A-Z0-9]{4}/g);

    if (!codes || codes.length !== 10) throw new Error('Falha ao gerar 10 códigos de recuperação');
    console.log(`[1] ✅ Gerados 10 códigos. Exemplo: ${codes[0]}`);

    // 2. Tentar logar com o primeiro código
    console.log(`\n[2] Testando login com código de recuperação: ${codes[0]}...`);
    await page.goto(`${BASE_URL}/login.html`);
    await page.fill('#username', USER);
    await page.fill('#token', codes[0]); // Simulando input no campo de token
    await page.click('#btnLogin');

    await page.waitForSelector('.success');
    const successMsg = await page.textContent('.success');
    console.log(`[2] ✅ Login OK: ${successMsg}`);

    // 3. Tentar REUSAR o mesmo código (deve falhar)
    console.log(`\n[3] Testando REUSO do código ${codes[0]} (deve falhar)...`);
    // Recarregar página para limpar estado
    await page.reload();
    await page.fill('#username', USER);
    await page.fill('#token', codes[0]);
    await page.click('#btnLogin');

    await page.waitForSelector('.error');
    const errorMsg = await page.textContent('.error');

    if (errorMsg?.includes('inválido')) { // Msg genérica "Código inválido" para seguranca
        console.log(`[3] ✅ Bloqueado corretamente: ${errorMsg}`);
    } else {
        console.error(`[3] ❌ FALHA: Código reutilizado ou erro inesperado: ${errorMsg}`);
    }

    await browser.close();
    console.log('\n🧪 TESTE CONCLUÍDO.');
}

main().catch(console.error);
