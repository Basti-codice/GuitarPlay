const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-audio-capture=/tmp/cchord.wav'] });
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 820 }, permissions: ['microphone'] });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:4173/#/chords');
  await page.click('text=Enable microphone >> nth=-1');
  let ok = false;
  for (let i = 0; i < 30 && !ok; i++) { await page.waitForTimeout(300); ok = await page.locator('.toast', { hasText: 'rings clean' }).count() > 0; }
  console.log('C chord detected as clean via real mic path:', ok);
  await page.screenshot({ path: '/tmp/chord-mic.png' });
  await browser.close();
})();
