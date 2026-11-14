// Films gameplay frame by frame: the game clock is frozen and advanced exactly 1/30 s per
// captured frame, so the result plays back smoothly at 30 fps however slow rendering is.
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = __dirname + '/frames/';
const W = 720, H = 1280, FPS = 30, DT = 1000 / FPS;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist'] });
  const pg = await b.newPage({ viewport: { width: W, height: H } });
  pg.setDefaultTimeout(600000);
  pg.on('pageerror', e => console.log('PAGEERROR', e.message));
  await pg.addInitScript(() => {
    const realNow = performance.now.bind(performance), origRAF = window.requestAnimationFrame.bind(window);
    let q = []; window.__manual = false; window.__vt = 0;
    window.requestAnimationFrame = cb => { if (!window.__manual) return origRAF(cb); q.push(cb); return 1; };
    performance.now = () => (window.__manual ? window.__vt : realNow());
    window.__goManual = () => { window.__vt = realNow(); window.__manual = true; };
    window.__step = ms => { window.__vt += ms; const run = q; q = []; run.forEach(cb => cb(window.__vt)); };
  });
  await pg.route('**/fonts.googleapis.com/**', r => r.abort());
  await pg.goto('http://localhost:5173/', { timeout: 600000 });
  await pg.evaluate(() => { document.querySelector('#begin').click(); document.querySelector('.choice[data-reader="boy"]').click(); });
  await pg.waitForTimeout(4000);
  await pg.evaluate(() => { for (let i = 0; i < 3; i++) document.querySelector('#scene-next').click(); });
  // let every model and texture load in real time first
  for (let i = 0; i < 40; i++) {
    await pg.waitForTimeout(5000);
    const d = await pg.evaluate(() => GAME.world.debug());
    if (d.readerLoaded && d.demonLoaded && i > 14) break;
  }
  await pg.addStyleTag({ content: '#app, #joystick, #walk-hud, #demon-card, #veil { display: none !important; }' });
  await pg.evaluate(() => { window.__goManual(); GAME.world.setNight(.3); });

  let n = 0;
  const step = (k = 1) => pg.evaluate(([k, dt]) => { for (let i = 0; i < k; i++) window.__step(dt); }, [k, DT]);
  async function shoot(name, seconds, perFrame) {
    const frames = Math.round(seconds * FPS);
    for (let f = 0; f < frames; f++) {
      if (perFrame) await pg.evaluate(perFrame, f);
      await step();
      await pg.screenshot({ path: `${OUT}${name}-${String(f).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 93 });
      n++;
    }
    console.log(name, 'done', frames, 'frames');
  }

  // 1. walking the forest path
  await pg.evaluate(() => { GAME.world.setControl(true); GAME.world.teleport(1, -6, 2.8, .16); GAME.world.camera(2.8, .16, 4.2); });
  await step(3);
  await pg.keyboard.down('KeyW');
  await shoot('a-walk', 2.0);
  await pg.keyboard.up('KeyW');

  // 2. approaching the river, the tower beyond
  await pg.evaluate(() => { GAME.world.teleport(0, -121, Math.PI, .2); GAME.world.camera(Math.PI, .2, 5); });
  await step(3);
  await pg.keyboard.down('KeyW');
  await shoot('b-river', 1.5);
  await pg.keyboard.up('KeyW');

  // 3. the night sky: low camera, slowly turning
  await pg.evaluate(() => { GAME.world.teleport(0, -127, Math.PI * .82, .03); GAME.world.camera(Math.PI * .82, .03, 6); });
  await step(3);
  await shoot('c-sky', 1.3, f => GAME.world.camera(Math.PI * .82 + f * .0025, .03 + f * .0004, 6));

  // 4. arriving at the clock tower
  await pg.evaluate(() => { GAME.world.teleport(2.5, -164, Math.PI, .08); GAME.world.camera(Math.PI, .08, 6.5); });
  await step(3);
  await pg.keyboard.down('KeyW');
  await shoot('d-tower', 2.0);
  await pg.keyboard.up('KeyW');

  // 5. a demon appears, the weather turns
  await pg.evaluate(() => { GAME.world.teleport(-3, -40, 2.9, .14); GAME.world.camera(2.9, .14, 5.2); GAME.world.setMood(true); GAME.world.summon('fog'); });
  await step(4);
  await shoot('e-demon', 1.6);

  console.log('total frames', n);
  await b.close();
})();
