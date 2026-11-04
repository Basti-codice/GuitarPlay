// Real microphone path test: Chrome's fake capture device plays a WAV (A2 pluck) into getUserMedia.
const { chromium } = require('playwright');
const wav = process.argv[2] || '/tmp/a2.wav';
const URL = process.env.URL || 'http://127.0.0.1:4173';
(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${wav}`] });
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 820 }, permissions: ['microphone'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL + '/#/tuner');
  await page.click('text=Enable microphone');
  const seen = new Set();
  for (let i = 0; i < 24; i++) {
    await page.waitForTimeout(250);
    const t = await page.textContent('#tuner-note');
    const sub = await page.textContent('.card.center .muted');
    seen.add(t + ' | ' + sub);
  }
  console.log([...seen].join('\n'));
  await page.screenshot({ path: '/tmp/tuner-wav.png' });
  console.log('errors', errors);
  await browser.close();
})();
