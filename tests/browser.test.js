import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { brotliDecompressSync } from 'node:zlib';
import { join, resolve, extname, sep } from 'node:path';
import chromium from '@sparticuz/chromium';
import { chromium as playwrightChromium } from 'playwright-core';

const root = resolve('dist');
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.bcmap': 'application/octet-stream', '.ttf': 'font/ttf' };

function serve() {
  const server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
      const path = resolve(root, relative);
      if (!path.startsWith(root + sep) && path !== join(root, 'index.html')) { res.writeHead(403).end(); return; }
      const data = await readFile(path);
      res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(data);
    } catch { res.writeHead(404).end('not found'); }
  });
  return new Promise(resolveServer => server.listen(0, '127.0.0.1', () => resolveServer(server)));
}

async function browserEnvironment() {
  const env = { ...process.env };
  if (process.platform !== 'linux') return env;
  const systemHasNspr = ['/usr/lib/x86_64-linux-gnu/libnspr4.so', '/lib/x86_64-linux-gnu/libnspr4.so', '/usr/lib64/libnspr4.so'].some(existsSync);
  if (systemHasNspr) return env;
  const directory = join(tmpdir(), 'sourceforge-chromium-libs');
  const library = join(directory, 'lib', 'libnspr4.so');
  if (!existsSync(library)) {
    await mkdir(directory, { recursive: true });
    const archive = await readFile(resolve('node_modules/@sparticuz/chromium/bin/al2023.tar.br'));
    execFileSync('tar', ['-xf', '-', '-C', directory], { input: brotliDecompressSync(archive) });
  }
  env.LD_LIBRARY_PATH = [join(directory, 'lib'), env.LD_LIBRARY_PATH].filter(Boolean).join(':');
  return env;
}

test('browser workflow: imports, citations, notebook isolation/duplication, backup restore, PWA offline shell', { timeout: 120000 }, async t => {
  const server = await serve(); let browser;
  try {
    browser = await playwrightChromium.launch({ executablePath: await chromium.executablePath(), args: chromium.args.filter(arg => arg !== '--single-process' && arg !== '--no-zygote'), headless: true, env: await browserEnvironment() });
    const context = await browser.newContext({ acceptDownloads: true }); const page = await context.newPage();
    const pageErrors = [], consoleErrors = []; page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('dialog', async dialog => { await dialog.accept(dialog.type() === 'prompt' ? 'Second notebook' : undefined); });
    const address = `http://127.0.0.1:${server.address().port}`;
    await page.goto(address);
    try { await page.waitForFunction(() => document.querySelector('#notebook-select')?.options.length > 0, null, { timeout: 8000 }); }
    catch (error) { const body = await page.locator('body').innerText().catch(() => '(body unavailable)'); throw new Error(`App did not initialize: ${error.message}; page=${body}; console=${consoleErrors.join(' | ')}; pageErrors=${pageErrors.join(' | ')}`); }
    assert.match(await page.title(), /SourceForge/);
    const originalNotebookId = await page.locator('#notebook-select').inputValue();

    await page.click('#add-text-source'); await page.locator('#source-name').fill('Reef field notes');
    await page.locator('#source-text').fill('\n\nCoral reefs provide habitat and shelter for thousands of marine species.\nWarming ocean water stresses reef ecosystems.');
    await page.locator('#source-form button[type="submit"]').click();
    await page.waitForSelector('.source-item');
    assert.match(await page.locator('.source-info b').textContent(), /Reef field notes\.txt/);
    await page.locator('#question').fill('What do coral reefs provide?'); await page.locator('#chat-form button[type="submit"]').click();
    await page.waitForFunction(() => document.querySelectorAll('.message').length === 2);
    assert.match(await page.locator('.message.assistant .message-bubble').textContent().catch(() => page.locator('.message:not(.user) .message-bubble').textContent()), /habitat|evidence/i);
    assert.equal(await page.locator('.citation-chip').count(), 1);
    await page.locator('.citation-chip').click(); await page.waitForSelector('.source-item.expanded');

    await page.locator('#source-filter').fill('warming ocean'); await page.waitForFunction(() => document.querySelectorAll('.source-item').length === 1);
    await page.locator('#source-filter').fill('no match'); await page.waitForFunction(() => document.querySelectorAll('.source-item').length === 0);
    await page.locator('#source-filter').fill(''); await page.waitForFunction(() => document.querySelectorAll('.source-item').length === 1);

    await page.locator('#new-notebook').click(); await page.waitForFunction(() => document.querySelector('#notebook-select').options.length === 2);
    assert.equal(await page.locator('.source-item').count(), 0);
    await page.locator('#notebook-select').selectOption(originalNotebookId);
    await page.waitForFunction(() => document.querySelectorAll('.source-item').length === 1);
    await page.locator('#duplicate-notebook').click(); await page.waitForFunction(() => document.querySelector('#notebook-select').options.length === 3);
    await page.waitForFunction(() => document.querySelectorAll('.source-item').length === 1);

    await page.locator('.studio-card[data-output="report"]').click();
    const reportDownloadPromise = page.waitForEvent('download'); await page.locator('#download-report').click();
    const report = await readFile(await (await reportDownloadPromise).path(), 'utf8');
    assert.match(report, /study report/i); assert.match(report, /lines \d+–\d+/);
    await page.locator('.studio-card[data-output="csv"]').click();
    const csvDownloadPromise = page.waitForEvent('download'); await page.locator('#download-csv').click();
    const csv = await readFile(await (await csvDownloadPromise).path(), 'utf8');
    assert.match(csv, /Question,Answer,Source,Page,Lines/); assert.match(csv, /Coral reefs provide habitat/);

    const downloadPromise = page.waitForEvent('download'); await page.locator('#export-notebook').click();
    const download = await downloadPromise; const backupPath = await download.path();
    const backup = JSON.parse(await readFile(backupPath, 'utf8'));
    assert.equal(backup.schemaVersion, 1); assert.ok(backup.sources.length); assert.ok(backup.messages.length);
    await page.locator('[data-page="settings"]').first().click();
    await page.locator('#backup-input').setInputFiles({ name: 'test-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
    await page.waitForFunction(() => [...document.querySelector('#notebook-select').options].some(o => o.textContent.includes('(imported)')));
    assert.equal(await page.locator('.source-item').count(), 1);

    const swDetails = await page.evaluate(async () => ({ supported: 'serviceWorker' in navigator, url: location.href, registrations: 'serviceWorker' in navigator ? (await navigator.serviceWorker.getRegistrations()).map(r => ({ active: r.active?.state, installing: r.installing?.state, waiting: r.waiting?.state, scope: r.scope })) : [] }));
    const offlineReady = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false;
      try { await Promise.race([navigator.serviceWorker.ready, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000))]); return true; } catch { return false; }
    });
    assert.equal(offlineReady, true, `service worker activates on localhost (${JSON.stringify(swDetails)})`);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.mobile-tab[data-page="settings"]').click(); assert.ok(await page.locator('#page-settings').isVisible());
    await page.locator('.mobile-tab[data-page="research"]').click();
    await context.setOffline(true); await page.reload(); await page.waitForFunction(() => document.querySelector('#notebook-select')?.options.length > 0);
    await page.waitForFunction(() => document.querySelectorAll('.source-item').length === 1, null, { timeout: 15000 });
    assert.equal(await page.locator('.source-item').count(), 1, 'IndexedDB notebook/source survive an offline reload');
    await context.setOffline(false);
    assert.deepEqual(pageErrors, []);
    await t.diagnostic('Chromium '+browser.version()+' verified notebook/source/chat/backup flows and offline shell opening.');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolveClose => server.close(resolveClose));
  }
});
