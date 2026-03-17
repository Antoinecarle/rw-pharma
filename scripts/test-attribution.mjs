#!/usr/bin/env node
import { chromium } from 'playwright';

const BASE = 'https://web-production-ecb62.up.railway.app';
const EMAIL = 'julie@rwpharma.com';
const PASS = 'Test1234!';

async function extractTable(page) {
  const tables = page.locator('table');
  const count = await tables.count();
  if (count === 0) return [];
  let maxR = 0, best = 0;
  for (let t = 0; t < count; t++) {
    const rc = await tables.nth(t).locator('tr').count();
    if (rc > maxR) { maxR = rc; best = t; }
  }
  const rows = await tables.nth(best).locator('tr').all();
  const data = [];
  for (const row of rows) {
    const cells = await row.locator('td, th').allTextContents();
    if (cells.length > 0) data.push(cells.map(c => c.trim()));
  }
  return data;
}

async function clickStrategy(page, label) {
  // Click "Auto-attribution" to open dropdown
  const autoBtn = page.locator('button').filter({ hasText: /Auto-attribution/i });
  if (await autoBtn.count() > 0) {
    await autoBtn.first().click();
    await page.waitForTimeout(500);
  }
  // Find the strategy in the dropdown
  const menuItems = page.locator('[role="menuitem"]');
  const mc = await menuItems.count();
  for (let i = 0; i < mc; i++) {
    const txt = await menuItems.nth(i).textContent();
    if (new RegExp(label.replace("'", "."), 'i').test(txt)) {
      await menuItems.nth(i).click();
      await page.waitForTimeout(2000);
      return true;
    }
  }
  // Fallback: try button match
  const btn = page.locator('button').filter({ hasText: new RegExp(label.replace("'", "."), 'i') });
  if (await btn.count() > 0) {
    await btn.first().click();
    await page.waitForTimeout(2000);
    return true;
  }
  return false;
}

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

  // Navigate to Phase 1 → Attribution Macro
  const phase1 = page.locator('button').filter({ hasText: /Phase 1/i });
  if (await phase1.count() > 0) { await phase1.first().click(); await page.waitForTimeout(1000); }

  const attrStep = page.locator('button').filter({ hasText: /Attribution Macro/i });
  if (await attrStep.count() > 0) { await attrStep.first().click(); await page.waitForTimeout(2000); }
  console.log('On Attribution Macro step');

  // ── First, reset if needed ──
  const resetBtn = page.locator('button').filter({ hasText: /reinitialiser|reset/i });
  if (await resetBtn.count() > 0) {
    await resetBtn.first().click();
    await page.waitForTimeout(1000);
  }

  // ── Test 3 strategies ──
  const strategies = [
    { label: 'Proportionnelle', key: 'proportional' },
    { label: "Top grossiste", key: 'top_first' },
    { label: 'Max couverture', key: 'max_coverage' },
  ];
  const allResults = {};

  for (const strat of strategies) {
    console.log(`\n=== ${strat.label} ===`);

    const ok = await clickStrategy(page, strat.label);
    if (!ok) {
      console.log('  FAILED to click strategy');
      continue;
    }

    await page.screenshot({ path: `/tmp/attr-${strat.key}.png`, fullPage: true });

    const data = await extractTable(page);
    allResults[strat.label] = data;
    console.log(`  ${data.length} rows`);

    // Print a focused view: just product name + allocation columns
    for (const r of data) {
      // Row format: CIP13 | Produit+clients | Demande | WS1 | WS2 | ... | Attribue | Reste
      if (r.length >= 4) {
        const produit = r[1]?.substring(0, 30) || '';
        const demande = r[2] || '';
        const attribue = r[r.length - 2] || '';
        const reste = r[r.length - 1] || '';
        // Wholesaler columns
        const wsCols = r.slice(3, r.length - 2).join(' | ');
        console.log(`    ${produit.padEnd(32)} D:${demande.padEnd(6)} -> ${wsCols} | Attr:${attribue} Reste:${reste}`);
      }
    }

    // Reset before next strategy
    const rst = page.locator('button').filter({ hasText: /reinitialiser|reset/i });
    if (await rst.count() > 0) {
      await rst.first().click();
      await page.waitForTimeout(500);
    }
  }

  // ── Compare ──
  console.log('\n' + '='.repeat(60));
  console.log('COMPARISON');
  console.log('='.repeat(60));

  const keys = Object.keys(allResults);
  if (keys.length < 2) {
    console.log(`Only got ${keys.length} results.`);
    await browser.close();
    process.exit(1);
  }

  // Compare each pair
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const same = JSON.stringify(allResults[keys[i]]) === JSON.stringify(allResults[keys[j]]);
      console.log(`\n${keys[i]} vs ${keys[j]}: ${same ? '❌ IDENTICAL' : '✅ DIFFERENT'}`);

      if (!same) {
        const a = allResults[keys[i]], b = allResults[keys[j]];
        for (let r = 1; r < Math.min(a.length, b.length); r++) { // skip header
          if (JSON.stringify(a[r]) !== JSON.stringify(b[r])) {
            const prodA = a[r][1]?.substring(0, 25) || 'unknown';
            const wsA = a[r].slice(3, a[r].length - 2).join(', ');
            const wsB = b[r].slice(3, b[r].length - 2).join(', ');
            console.log(`  ${prodA}: [${wsA}] vs [${wsB}]`);
          }
        }
      }
    }
  }

  // ── Data analysis: demand vs supply ──
  console.log('\n' + '='.repeat(60));
  console.log('DEMAND vs SUPPLY ANALYSIS');
  console.log('='.repeat(60));

  const firstResult = allResults[keys[0]];
  if (firstResult) {
    for (let r = 1; r < firstResult.length; r++) {
      const row = firstResult[r];
      if (row.length < 4) continue;
      const produit = row[1]?.substring(0, 30) || '';
      const demande = parseInt(row[2]?.replace(/\s/g, '') || '0');
      // Parse wholesaler columns: format like "300/300" or "—"
      let totalSupply = 0;
      for (let c = 3; c < row.length - 2; c++) {
        const match = row[c].match(/(\d+)\/(\d+)/);
        if (match) totalSupply += parseInt(match[2]);
      }
      const ratio = totalSupply > 0 ? (demande / totalSupply).toFixed(2) : 'N/A';
      const willDiffer = demande < totalSupply ? '✅ STRATEGIES WILL DIFFER' : '❌ demand >= supply (identical)';
      console.log(`  ${produit.padEnd(32)} D:${String(demande).padEnd(6)} S:${String(totalSupply).padEnd(6)} ratio:${ratio} ${willDiffer}`);
    }
  }

  await browser.close();
  console.log('\nDone!');
})().catch(err => { console.error('Error:', err); process.exit(1); });
