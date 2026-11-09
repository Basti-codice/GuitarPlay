const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:4173';
(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 820 }, permissions: ['microphone'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  for (const mode of ['fall', 'side']) {
    await page.goto(BASE + '/#/library');
    await page.evaluate((m) => localStorage.setItem('guitarplay.settings.v1', JSON.stringify({ waterfallMode: m })), mode);
    await page.goto(BASE + '/#/play/a-minor-pentatonic-1?track=main&speed=1&mode=realtime&sim=1&err=0.1');
    await page.reload();
    await page.click('#begin');
    await page.waitForTimeout(7500);
    await page.screenshot({ path: `/tmp/view-${mode}.png` });
    console.log(mode, 'ok');
  }
  // chords track in side mode
  await page.goto(BASE + '/#/play/four-chord-pop-loop?track=chords&speed=1&mode=listen');
  await page.reload();
  await page.click('#begin');
  await page.waitForTimeout(5000);
  await page.screenshot({ path: '/tmp/view-side-chords.png' });

  // editor: long piece
  await page.goto(BASE + '/#/editor');
  for (let i = 0; i < 4; i++) { await page.click('button:has-text("+ 4 bars")'); }
  await page.click('td[data-c="0"][data-s="5"]');
  await page.keyboard.type('3');
  for (let i = 0; i < 40; i++) { await page.keyboard.press('ArrowRight'); await page.keyboard.type(String(i % 10)); }
  await page.click('#insert-after');
  await page.click('#add-bar');
  await page.waitForTimeout(300);
  const cellW = await page.evaluate(() => document.querySelector('td[data-c="0"][data-s="5"]').getBoundingClientRect().width);
  console.log('cell width after adding many bars:', cellW, 'systems:', await page.locator('.tabsys').count());
  await page.screenshot({ path: '/tmp/editor-long.png' });
  // undo
  await page.keyboard.press('Control+z');
  console.log('errors:', JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
