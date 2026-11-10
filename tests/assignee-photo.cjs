// Offline browser regression: never connects to Supabase.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.route('**/*', route => route.abort());
    await page.setContent(fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8').replace(/<script[^>]*>[\s\S]*?<\/script>/g, ''));
    await page.evaluate(() => {
      window.rows = [{ id: 'old', reporter_name: '虛構甲', location: '示範室', category: '設備', description: '舊紀錄', urgency: '中', status: '待處理', created_at: '2026-01-01T00:00:00Z' }];
      window.REPAIR_CONFIG = { supabaseUrl: 'mock', supabasePublishableKey: 'mock' };
      window.supabase = { createClient: () => ({ from: () => ({
        select: columns => { window.columns = columns; const q = { order: () => q, limit: async () => ({ data: window.rows }) }; return q; },
        insert: async payload => { window.payload = payload; window.rows.unshift({ ...payload, id: 'new', status: '待處理', created_at: new Date().toISOString() }); return {}; }
      }) }) };
    });
    await page.addScriptTag({ path: path.join(__dirname, '../app.js') });
    await page.waitForFunction(() => document.querySelectorAll('.request').length === 1);
    assert.match(await page.locator('.request').textContent(), /負責人：未指定/);
    assert.match(await page.locator('.request').textContent(), /照片網址：未提供/);
    for (const photo of ['', 'https://example.com/photo.jpg']) {
      for (const [name, value] of Object.entries({ reporter_name: '虛構乙', location: '示範室', description: '測試報修', assignee: '虛構丙', photo_url: photo })) await page.locator(`[name=${name}]`).fill(value);
      await page.locator('[name=category]').selectOption('設備');
      await page.locator('[name=photo_url]').fill('javascript:alert(1)');
      assert.equal(await page.locator('#repair-form').evaluate(el => el.checkValidity()), false);
      await page.locator('[name=photo_url]').fill(photo);
      await page.locator('[name=assignee]').fill('   ');
      await page.locator('#submit-button').click();
      assert.match(await page.locator('#form-message').textContent(), /不可只有空白/);
      await page.locator('[name=assignee]').fill('虛構丙');
      await page.locator('#submit-button').click();
      await page.waitForFunction(() => document.querySelector('#form-message').textContent.includes('成功'));
      const payload = await page.evaluate(() => window.payload);
      assert.equal(payload.assignee, '虛構丙');
      assert.equal(payload.photo_url, photo || null);
      assert.equal('status' in payload, false);
      assert.equal('created_at' in payload, false);
      assert.match(await page.locator('.request').first().textContent(), /負責人：虛構丙/);
      if (photo) assert.equal(await page.locator('.request a').first().getAttribute('href'), photo);
    }
    assert.match(await page.evaluate(() => window.columns), /assignee,photo_url/);
    assert.equal(await page.locator('[name=assignee]').getAttribute('required'), '');
    console.log('PASS: legacy rows, required assignee, optional photo, safe URLs, insert and readback with timestamp (offline mobile browser)');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
