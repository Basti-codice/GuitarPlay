const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1360, height: 700 } });
  for (const r of ['/', '/library', '/learn', '/settings', '/stats', '/help', '/editor', '/import', '/chords', '/fretboard']) {
    await page.goto('http://127.0.0.1:4173/#' + r);
    await page.waitForTimeout(500);
    await page.mouse.move(700, 400);
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(200);
    const st = await page.evaluate(() => { const c = document.getElementById('scroller'); return { top: Math.round(c.scrollTop), max: c.scrollHeight - c.clientHeight, docH: document.documentElement.scrollHeight, win: innerHeight }; });
    console.log(r.padEnd(12), JSON.stringify(st), st.max <= 0 || st.top > 0 ? 'OK' : 'NOT SCROLLING');
  }
  // sidebar must scroll too on a short window
  await page.setViewportSize({ width: 1360, height: 420 });
  await page.goto('http://127.0.0.1:4173/#/');
  await page.waitForTimeout(400);
  await page.mouse.move(100, 200);
  await page.mouse.wheel(0, 500);
  console.log('sidebar scrollTop:', await page.evaluate(() => document.querySelector('.sidebar').scrollTop));
  await b.close();
})();
