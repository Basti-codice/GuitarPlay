const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:4173';
(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 820 }, permissions: ['microphone'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  // 1. listen mode with backing + reference + click
  await page.goto(BASE + '/#/library');
  await page.evaluate(() => localStorage.setItem('guitarplay.settings.v1', JSON.stringify({ backingOn: true, refOn: true, clickOn: true })));
  await page.goto(BASE + '/#/play/four-chord-pop-loop?track=chords&speed=1&mode=listen');
  await page.reload();
  await page.click('#begin');
  await page.waitForTimeout(4000);
  await page.screenshot({ path: '/tmp/modes-listen.png' });
  console.log('listen running ok');

  // 2. pause / resume
  await page.keyboard.press('Space');
  await page.waitForSelector('text=Paused');
  await page.screenshot({ path: '/tmp/modes-paused.png' });
  await page.click('text=Resume');
  await page.waitForTimeout(1500);
  console.log('pause/resume ok');

  // 3. wait mode with virtual player
  await page.evaluate(() => localStorage.setItem('guitarplay.settings.v1', JSON.stringify({ backingOn: false, refOn: false, clickOn: false })));
  await page.goto(BASE + '/#/play/twinkle-twinkle-little-star?track=melody&speed=1&mode=wait&sim=1&err=0');
  await page.reload();
  await page.click('#begin');
  await page.waitForSelector('#result-acc', { timeout: 90000 });
  console.log('wait mode accuracy:', await page.textContent('#result-acc'));

  // 4. loop mode (bars 2-3) with virtual player for 12 s
  await page.goto(BASE + '/#/play/twinkle-twinkle-little-star?track=melody&speed=1&mode=realtime&sim=1&err=0&loop=2-3');
  await page.reload();
  await page.click('#begin');
  await page.waitForTimeout(12000);
  await page.screenshot({ path: '/tmp/modes-loop.png' });
  console.log('loop ok');
  console.log('errors:', JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
