#!/usr/bin/env node
import { chromium } from 'playwright';

const BASE = 'https://web-production-ecb62.up.railway.app';
const EMAIL = 'julie@rwpharma.com';
const PASS = 'Test1234!';

(async () => {
  const browser = await chromium.launch({ headless: true, chromiumSandbox: false });
  const page = await browser.newPage();

  // Login
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);
  const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="mail"]');
  if (await emailInput.count() > 0) {
    await emailInput.fill(EMAIL);
    await page.locator('input[type="password"]').fill(PASS);
    await page.locator('button[type="submit"], button:has-text("connecter")').first().click();
    await page.waitForTimeout(3000);
  }
  console.log('Logged in');

  // Go to Avril 2027 process
  await page.goto(`${BASE}/monthly-processes`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  const avrilLink = page.locator('a[href*="/monthly-processes/"]').filter({ hasText: /avril/i });
  await (await avrilLink.count() > 0 ? avrilLink.first() : page.locator('a[href*="/monthly-processes/"]').first()).click();
  await page.waitForTimeout(3000);
  console.log('On process:', page.url());

  // Phase 1
  const phase1 = page.locator('button').filter({ hasText: /Phase 1/i });
  if (await phase1.count() > 0) { await phase1.first().click(); await page.waitForTimeout(1000); }

  // ==== TEST 1: Quota Import (Import Disponibilites) ====
  console.log('\n========== TEST 1: Import Disponibilites ==========');
  const dispoStep = page.locator('button').filter({ hasText: /Import Disp/i });
  if (await dispoStep.count() > 0) {
    await dispoStep.first().click();
    await page.waitForTimeout(2000);
    console.log('On Import Disponibilites step');
  }

  // Expand example files
  const exToggle1 = page.locator('button').filter({ hasText: /exemple|Fichiers d.exemple/i });
  if (await exToggle1.count() > 0) {
    await exToggle1.first().click();
    await page.waitForTimeout(1000);
    console.log('Expanded example files');
  }

  await page.screenshot({ path: '/tmp/test1-quota-examples.png', fullPage: true });

  // Check what's listed
  const allBtns1 = await page.locator('button').all();
  console.log('\nQuota example files visible:');
  for (const btn of allBtns1) {
    const txt = (await btn.textContent()).trim();
    if (/grossiste|Charger|quotas|Avril 2027|Janvier|Mars/i.test(txt) && txt.length < 80) {
      const vis = await btn.isVisible();
      if (vis) console.log(`  ${txt}`);
    }
  }

  // Load Avril 2027 quotas - click "Tous grossistes" button in the Avril 2027 group
  const tousGrossistes = page.locator('button').filter({ hasText: /Tous grossistes/i });
  if (await tousGrossistes.count() > 0) {
    console.log('\nClicking "Tous grossistes" to load Avril 2027 quotas...');
    await tousGrossistes.first().click();
    await page.waitForTimeout(3000);
  } else {
    // Try "Charger tout"
    const charger = page.locator('button, a').filter({ hasText: /Charger tout/i });
    if (await charger.count() > 0) {
      console.log('\nClicking "Charger tout"...');
      await charger.first().click();
      await page.waitForTimeout(3000);
    }
  }

  await page.screenshot({ path: '/tmp/test1-quota-loaded.png', fullPage: true });

  // Check loaded content
  const body1 = await page.textContent('body');
  console.log('\n--- CIP13 check in quotas ---');
  const newProducts = {
    '3400000000531': 'Kardegic',
    '3400000000951': 'Augmentin',
    '3400000000300': 'Advil',
    '3400000001077': 'Levothyrox',
    '3400000002701': 'Bisoprolol',
    '3400000004815': 'Plaquenil',
    '3400000004647': 'Cosentyx',
    '3400000008945': 'Ibrance',
    '3400000002974': 'Deroxat',
    '3400000007552': 'Diflucan',
  };
  const oldProducts = {
    '3400100000194': 'Paracetamol (OLD)',
    '3400000008287': 'Ebixa (OLD)',
    '3400000001462': 'Xarelto (OLD)',
  };

  let newFound = 0, oldFound = 0;
  for (const [cip, name] of Object.entries(newProducts)) {
    const found = body1.includes(cip);
    if (found) newFound++;
    console.log(`  ${found ? '✅' : '⬜'} ${cip} ${name}`);
  }
  for (const [cip, name] of Object.entries(oldProducts)) {
    const found = body1.includes(cip);
    if (found) oldFound++;
    console.log(`  ${found ? '❌' : '✅'} ${cip} ${name} ${found ? '(still present!)' : '(gone)'}`);
  }
  console.log(`\nQuotas: ${newFound} new CIP13s, ${oldFound} old CIP13s`);

  // Check wholesaler names
  console.log('\nWholesaler check:');
  for (const ws of ['EPSILON', "GINK'GO", 'SNA', 'SO', 'OCP']) {
    console.log(`  ${body1.includes(ws) ? '✅' : '❌'} ${ws}`);
  }

  // ==== TEST 2: Order Import ====
  console.log('\n========== TEST 2: Import Commandes ==========');
  const cmdStep = page.locator('button').filter({ hasText: /Import Commandes/i });
  if (await cmdStep.count() > 0) {
    await cmdStep.first().click();
    await page.waitForTimeout(2000);
    console.log('On Import Commandes step');
  }

  // Expand example files
  const exToggle2 = page.locator('button').filter({ hasText: /exemple|Fichiers d.exemple/i });
  if (await exToggle2.count() > 0) {
    await exToggle2.first().click();
    await page.waitForTimeout(1000);
  }

  await page.screenshot({ path: '/tmp/test2-order-examples.png', fullPage: true });

  // List all example buttons
  console.log('\nOrder example files visible:');
  const allBtns2 = await page.locator('button').all();
  for (const btn of allBtns2) {
    const txt = (await btn.textContent()).trim();
    if (/ORIFARM|MPA|AXICORP|CC PHARMA|MEDCOR|BROCACEF|ABACUS|Charger|Avril 2027/i.test(txt) && txt.length < 80) {
      const vis = await btn.isVisible();
      if (vis) console.log(`  ${txt}`);
    }
  }

  // Load ORIFARM file
  const oriBtn = page.locator('button').filter({ hasText: /ORIFARM/i });
  const oriCount = await oriBtn.count();
  console.log(`\nOrifarm buttons: ${oriCount}`);
  if (oriCount > 0) {
    // Click the first visible one
    for (let i = 0; i < oriCount; i++) {
      if (await oriBtn.nth(i).isVisible()) {
        await oriBtn.nth(i).click();
        await page.waitForTimeout(3000);
        console.log('Loaded ORIFARM file');
        break;
      }
    }
  }

  await page.screenshot({ path: '/tmp/test2-order-ori-loaded.png', fullPage: true });

  // Check content
  const body2 = await page.textContent('body');
  console.log('\n--- ORI order file content ---');
  // Check for ORI column format (External, Itemname, Quantity, Unitprice)
  console.log(`  ${body2.includes('External') ? '✅' : '❌'} "External" column header`);
  console.log(`  ${body2.includes('Itemname') ? '✅' : '❌'} "Itemname" column header`);

  // Check for new product names
  for (const name of ['Kardegic', 'Augmentin', 'Advil', 'Bisoprolol', 'Plaquenil']) {
    console.log(`  ${body2.includes(name) ? '✅' : '❌'} ${name}`);
  }
  // Check for old products
  console.log(`  ${body2.includes('Paracetamol') ? '❌ OLD' : '✅ No old'} Paracetamol check`);

  // Get preview table data
  const tables = page.locator('table');
  const tc = await tables.count();
  if (tc > 0) {
    console.log('\nPreview table:');
    const rows = await tables.first().locator('tr').all();
    for (const row of rows.slice(0, 5)) {
      const cells = await row.locator('td, th').allTextContents();
      console.log(`  ${cells.map(c => c.trim()).join(' | ')}`);
    }
  }

  await browser.close();
  console.log('\n=== All tests done ===');
})().catch(err => { console.error('Error:', err); process.exit(1); });
