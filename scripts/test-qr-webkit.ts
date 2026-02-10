
import { chromium, webkit, firefox } from 'playwright';

const BASE_URL = 'http://localhost';
const USER = `qr-test-${Date.now()}@test.com`;

async function main() {
    console.log('🧪 TESTING QR CODE GENERATION (WebKit/Safari)');

    // Use WebKit to simulate Safari
    const browser = await webkit.launch();
    const page = await browser.newPage();

    // Capture Browser Console Logs
    page.on('console', msg => console.log(`[BROWSER] ${msg.type()}: ${msg.text()}`));
    page.on('pageerror', err => console.log(`[BROWSER] ERROR: ${err.message}`));

    try {
        console.log('[1] Navigating to home...');
        await page.goto(`${BASE_URL}/`);

        console.log('[2] Setting up account...');
        await page.fill('#username', USER);
        await page.click('#btnSetup');

        // Wait for step 2 (QR verify)
        await page.waitForSelector('#step2', { state: 'visible', timeout: 5000 });
        console.log('[3] Setup complete. Checking QR Image...');

        // Check image src
        const src = await page.getAttribute('#qrImage', 'src');
        if (!src || !src.startsWith('data:image/png;base64,')) {
            throw new Error(`Invalid QR Source: ${src?.substring(0, 50)}...`);
        }
        console.log(`[4] QR Src exists and looks like data URI (${src.length} chars).`);

        // Check if image is loaded (naturalWidth > 0)
        const isLoaded = await page.evaluate(() => {
            const img = document.getElementById('qrImage') as HTMLImageElement;
            return img.complete && img.naturalWidth > 0;
        });

        if (isLoaded) {
            console.log('[5] ✅ QR Code Image loaded successfully in WebKit!');
        } else {
            console.error('[5] ❌ QR Code Image FAILED to load (broken image icon).');
        }

        // Snapshot for visual verification (optional)
        // await page.screenshot({ path: 'debug-qr-webkit.png' });

    } catch (e) {
        console.error('❌ Test Failed:', e);
    } finally {
        await browser.close();
    }
}

main();
