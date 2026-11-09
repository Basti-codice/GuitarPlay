const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:4173';
(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 820 }, permissions: ['microphone'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('dialog', (d) => d.accept());

  // 1. lesson exercise completes via virtual guitarist and is recorded
  await page.goto(BASE + '/#/play/open-strings?track=main&speed=1&mode=realtime&lesson=m1-tune-warmup&ex=1&need=0.8&sim=1&err=0');
  await page.reload();
  await page.click('#begin');
  await page.waitForSelector('#result-acc', { timeout: 90000 });
  const prog = await page.evaluate(() => JSON.parse(localStorage.getItem('guitarplay.progress.v1')));
  console.log('lesson counters:', JSON.stringify(prog.counters), 'lesson:', JSON.stringify(prog.lessons['m1-tune-warmup']), 'sessions:', prog.sessions.length);

  // 2. AI assistant import: copy prompt, paste a tab answer, adjust a setting, add to library
  await page.goto(BASE + '/#/import');
  await page.click('#copy-prompt');
  const sample = `Title: AI Test\nArtist: Someone\nTempo: 90\nMeter: 4/4\nGrid: 1/8\nTuning: standard\nCapo: 0\nKey: C\nDifficulty: 2\nGenre: Folk\nStyle: folk\n\nChords: C | G\ne|-0---0--|-3---3--|\nB|-1---1--|-0---0--|\nG|-0---0--|-0---0--|\nD|-2---2--|-0---0--|\nA|-3---3--|-2---2--|\nE|--------|-3---3--|`;
  await page.fill('#ai-paste', sample);
  await page.waitForSelector('#ai-result');
  await page.screenshot({ path: '/tmp/ai-import.png' });
  await page.click('#ai-add');
  await page.waitForSelector('#start-btn');
  console.log('AI import song page title:', await page.textContent('h1'));

  // 3. editor: type notes + chord, save
  await page.goto(BASE + '/#/editor');
  await page.fill('input >> nth=0', 'Editor Test');
  await page.click('td[data-c="0"][data-s="1"]');
  await page.keyboard.type('3');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.type('5');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.type('7');
  await page.click('button:has-text("Save")');
  await page.waitForSelector('#start-btn');
  console.log('editor song saved:', await page.textContent('h1'));
  // 4. library shows user songs
  await page.goto(BASE + '/#/library');
  await page.click('button:has-text("Mine")');
  await page.waitForTimeout(400);
  console.log('mine count:', await page.locator('#song-grid .card').count());
  // 5. jam builder
  await page.click('button:has-text("Jam builder")');
  await page.click('button:has-text("Create song")');
  await page.waitForSelector('#start-btn');
  console.log('jam song:', await page.textContent('h1'));
  console.log('errors:', JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
