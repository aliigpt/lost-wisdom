// Renders the 30-second reel frame by frame (1080x1920, 30 fps). Usage: node render.js [handle] [fromFrame] [toFrame]
const { chromium } = require('playwright');
const fs = require('fs');
const HANDLE = process.argv[2] || 'aliigpt';
const OUT = `${__dirname}/out-${HANDLE}/`;
const FPS = 30, TOTAL = 30;
const count = p => fs.readdirSync(__dirname + '/frames').filter(f => f.startsWith(p)).length;
// gameplay shots in the finale: [start time, shot, first frame to use]
const G = [[23.6, 'a-walk', 8], [25.0, 'b-river', 4], [26.1, 'e-demon', 6], [27.3, 'c-sky', 2], [28.3, 'd-tower', 6]];
function frameFor(t) {
  if (t < 23.6) return null;
  let g = G[0]; for (const x of G) if (t >= x[0]) g = x;
  const n = count(g[1]), i = Math.min(n - 1, g[2] + Math.floor((t - g[0]) * FPS));
  return `frames/${g[1]}-${String(i).padStart(4, '0')}.jpg`;
}
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  pg.on('pageerror', e => console.log('PAGEERROR', e.message));
  await pg.goto(`http://127.0.0.1:8099/reel.html?handle=${HANDLE}`);
  await pg.evaluate(() => document.fonts.ready); await pg.waitForTimeout(2000);
  const from = +(process.argv[3] || 0), to = +(process.argv[4] || FPS * TOTAL);
  for (let i = from; i < to; i++) {
    const t = i / FPS;
    await pg.evaluate(([t, src]) => window.render(t, src), [t, frameFor(t)]);
    await pg.screenshot({ path: `${OUT}f_${String(i).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 94 });
    if (i % 150 === 0) console.log('frame', i);
  }
  await b.close();
  console.log('done', OUT);
})();
