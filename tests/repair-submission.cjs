// Run against the configured Supabase demo; inserts one fictional record.
// RUN_LIVE_REPAIR_TEST=1 node tests/repair-submission.cjs
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');

(async () => {
  assert.equal(process.env.RUN_LIVE_REPAIR_TEST, '1', 'Explicitly enable the live demo test');
  const root = path.resolve(__dirname, '..');
  const server = http.createServer((req, res) => {
    const files = { '/': 'index.html', '/app.js': 'app.js', '/config.js': 'config.js', '/style.css': 'style.css' };
    const file = files[req.url];
    if (!file) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(fs.readFileSync(path.join(root, file)));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } : undefined });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    // curl uses the managed environment's proxy and trusted CA bundle.
    await page.route('https://**/*', async route => {
      const req = route.request();
      const args = ['--silent', '--show-error', '--max-time', '30', '-X', req.method(), req.url()];
      for (const [name, value] of Object.entries(req.headers())) {
        if (!['host', 'content-length', 'accept-encoding'].includes(name)) args.push('-H', `${name}: ${value}`);
      }
      if (req.postData()) args.push('--data-binary', req.postData());
      args.push('-w', '\n%{http_code}');
      const output = execFileSync('curl', args, { encoding: 'utf8' });
      const split = output.lastIndexOf('\n');
      await route.fulfill({ status: Number(output.slice(split + 1)), body: output.slice(0, split), contentType: req.url().includes('supabase.js') ? 'text/javascript' : 'application/json' });
    });
    page.on('requestfailed', r => console.error(r.url(), r.failure()));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(() => document.querySelector('#request-list').getAttribute('aria-busy') === 'false');
    assert.equal(await page.locator('#list-message').evaluate(el => el.classList.contains('error')), false, await page.locator('#list-message').textContent());
    const description = `虛構手機報修驗證 ${Date.now()}`;
    await page.locator('[name=reporter_name]').fill('測試小明（虛構）');
    await page.locator('[name=location]').fill('示範測試室（虛構）');
    await page.locator('[name=category]').selectOption('設備');
    await page.locator('[name=description]').fill(description);
    const responsePromise = page.waitForResponse(r => r.request().method() === 'POST' && r.url().includes('/rest/v1/'));
    await page.locator('#submit-button').click();
    const response = await responsePromise;
    assert.equal(response.status(), 201, await response.text());
    assert.match(response.url(), /\/repair_requests(?:\?|$)/);
    await page.waitForFunction(() => document.querySelector('#form-message').textContent === '報修已成功登記！' && document.querySelector('#request-list').getAttribute('aria-busy') === 'false');
    const card = page.locator('.request').filter({ hasText: description });
    assert.equal(await card.count(), 1);
    assert.match(await card.textContent(), /待處理/);
    assert.ok(await card.locator('time').getAttribute('datetime'));
    const permissions = await page.evaluate(async description => {
      const config = window.REPAIR_CONFIG;
      const headers = { apikey: config.supabasePublishableKey, 'Content-Type': 'application/json' };
      const base = `${config.supabaseUrl}/rest/v1/repair_requests`;
      const rows = await (await fetch(`${base}?description=eq.${encodeURIComponent(description)}&select=id`, { headers })).json();
      const url = `${base}?id=eq.${rows[0].id}`;
      const patch = await fetch(url, { method: 'PATCH', headers, body: JSON.stringify({ description: '不應生效' }) });
      const del = await fetch(url, { method: 'DELETE', headers });
      const remaining = await (await fetch(url + '&select=description', { headers })).json();
      return { patch: patch.status, delete: del.status, remaining };
    }, description);
    assert.ok([401, 403].includes(permissions.patch));
    assert.ok([401, 403].includes(permissions.delete));
    assert.equal(permissions.remaining[0].description, description);
    console.log(JSON.stringify({ mobile: '390x844', insert: response.status(), readBack: true, databaseTimestamp: true, permissions }));
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
