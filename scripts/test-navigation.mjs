import { chromium } from 'playwright';

const URL = 'https://web-production-ecb62.up.railway.app';

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();

  const errors = [];
  const supabaseReqs = [];

  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push(err.message));
  page.on('response', res => {
    if (res.url().includes('supabase')) {
      supabaseReqs.push({
        url: (res.url().split('/rest/v1/')[1] || res.url().split('.co/')[1] || '').substring(0, 80),
        status: res.status(),
      });
    }
  });

  await page.goto(URL, { waitUntil: 'networkidle', timeout: 15000 });

  if (page.url().includes('/login')) {
    const accounts = [
      { email: 'julie@rwpharma.com', pass: 'Admin123!' },
      { email: 'julie@rwpharma.com', pass: 'password' },
      { email: 'julie@rwpharma.com', pass: 'admin123' },
      { email: 'julie@rwpharma.com', pass: 'Password1!' },
      { email: 'julie@rwpharma.com', pass: 'Julie2024!' },
      { email: 'julie@rwpharma.com', pass: 'RwPharma2024!' },
    ];
    for (const { email, pass } of accounts) {
      await page.fill('#email', email);
      await page.fill('#password', pass);
      await page.click('button[type="submit"]');
      await page.waitForTimeout(2500);
      if (!page.url().includes('/login')) { console.log(`✅ Logged in: ${email}`); break; }
    }
  }

  if (page.url().includes('/login')) {
    console.log('❌ Need credentials. Placeholder: julie@rwpharma.com');
    await browser.close();
    process.exit(1);
  }

  // Dashboard loaded
  console.log(`Dashboard: ${page.url()}`);
  await page.waitForTimeout(4000);

  // Tab switch
  console.log('\nTab switch...');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(500);

  // Navigate to stock
  supabaseReqs.length = 0;
  console.log('\nNavigating to /stock...');
  await page.goto(URL + '/stock', { waitUntil: 'domcontentloaded', timeout: 10000 });

  for (let i = 1; i <= 10; i++) {
    await page.waitForTimeout(1000);
    // Expand debug panel
    await page.evaluate(() => {
      const els = document.querySelectorAll('[style*="fixed"][style*="left"]');
      els.forEach(el => { if (el.textContent?.match(/[●○]/) && !el.textContent?.includes('\n')) el.click?.(); });
    });
    await page.waitForTimeout(100);
    const debug = await page.evaluate(() => {
      const els = document.querySelectorAll('[style*="fixed"][style*="left"]');
      for (const el of els) { if (el.textContent?.match(/[●○]/)) return el.innerText; }
      return '';
    });
    const fetching = (debug.match(/⟳/g) || []).length;
    const pending = (debug.match(/○/g) || []).length;
    console.log(`[${i}s] fetching:${fetching} pending:${pending} | ${debug.replace(/\n/g, ' | ').substring(0, 200)}`);
    if (fetching === 0 && i > 3) break;
  }

  console.log(`\nSupabase requests: ${supabaseReqs.length}`);
  supabaseReqs.forEach(r => console.log(`  ${r.status} ${r.url}`));
  console.log(`\nErrors: ${errors.length}`);
  errors.slice(0, 5).forEach(e => console.log(`  ${e.substring(0, 150)}`));

  await page.screenshot({ path: '/tmp/test-stock.png' });
  console.log('\nScreenshot: /tmp/test-stock.png');

  await browser.close();
})();
