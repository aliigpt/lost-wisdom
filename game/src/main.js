// =====================================================================
//  MAIN: starts the 3D world and plays content/script.js step by step.
// =====================================================================

window.GAME = window.GAME || {};

(() => {
  const { $ } = GAME.ui;

  GAME.world = GAME.createWorld($('#world'));
  GAME.audio.music('music-title');   // starts with the first click (browsers require one)
  GAME.fx?.titleIn();
  addEventListener('click', e => { if (e.target.closest('button')) GAME.audio.play('ui-click', .5); });
  GAME.setWeather = cold => { document.body.classList.toggle('cold', cold); GAME.world.setMood(cold); };

  // ----- Title screen text -----
  const info = GAME.info || {};
  document.title = info.title || 'Lost Wisdom';
  $('#title-eyebrow').textContent = info.eyebrow || '';
  $('#title-heading').textContent = info.title || '';
  $('#title-tagline').textContent = info.tagline || '';
  $('#begin').textContent = info.startButton || 'Begin';

  // ----- Walk through the script -----
  let script = [], pages = [], step = 0;

  function run() {
    const item = script[step];
    if (!item) return showEnding();
    if (item.type === 'scene') { GAME.world.setControl(false); GAME.scenes.play(item, next); }
    else if (item.type === 'page') { GAME.world.setControl(false); GAME.book.open(item, pages.indexOf(item), pages.length, step === script.length - 1, next); }
    else if (item.type === 'walk') walk(item, next);
    else { console.warn('Unknown step type in script.js:', item); next(); }
  }
  // ----- Walking: the player moves the Reader until they reach the place -----
  const touch = matchMedia('(pointer: coarse)').matches;
  function walk(item, done) {
    const goal = GAME.ui.say(item.objective || `Walk to the ${item.to}`);
    if (GAME.fx) GAME.fx.objective($('#objective-text'), goal); else $('#objective-text').textContent = goal;
    $('#walk-hud').hidden = false;
    $('#joystick').hidden = !touch;
    GAME.world.walkTo(item.to, () => { $('#walk-hud').hidden = true; $('#joystick').hidden = true; GAME.world.joystick(0, 0); done(); });
  }
  // touch joystick
  const joy = $('#joystick'), stick = $('#stick');
  let joyId = null;
  const joyMove = e => {
    const r = joy.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, max = r.width / 2;
    let dx = e.clientX - cx, dy = e.clientY - cy; const len = Math.hypot(dx, dy);
    if (len > max) { dx *= max / len; dy *= max / len; }
    stick.style.transform = `translate(${dx}px, ${dy}px)`;
    GAME.world.joystick(dx / max, -dy / max);
  };
  joy.addEventListener('pointerdown', e => { joyId = e.pointerId; joy.setPointerCapture(e.pointerId); joyMove(e); });
  joy.addEventListener('pointermove', e => { if (e.pointerId === joyId) joyMove(e); });
  ['pointerup', 'pointercancel'].forEach(ev => joy.addEventListener(ev, () => { joyId = null; stick.style.transform = ''; GAME.world.joystick(0, 0); }));

  function next() {
    step++;
    scrollTo({ top: 0, behavior: GAME.ui.reduce ? 'auto' : 'smooth' });
    run();
  }

  function start() {
    ['#title-screen', '#choose', '#ending', '#game', '#scene', '#walk-hud'].forEach(s => { $(s).hidden = true; });
    GAME.book.reset(); GAME.demons.reset(); GAME.world.reset();
    GAME.setWeather(false);
    GAME.audio.music('music-explore');
    script = GAME.script || [];
    pages = script.filter(s => s.type === 'page');
    step = 0;
    GAME.fx?.cameraIntro();   // the camera swoops down to the Reader
    run();
  }

  // ----- Ending -----
  function showEnding() {
    const end = GAME.ending || {};
    $('#game').hidden = true; $('#scene').hidden = true; $('#ending').hidden = false;
    requestAnimationFrame(() => GAME.fx?.endingIn());
    $('#ending-title').textContent = GAME.ui.say(end.title || '');
    $('#ending-lines').innerHTML = '';
    (end.lines || []).forEach(t => { const p = document.createElement('p'); p.className = 'lede'; p.textContent = GAME.ui.say(t); $('#ending-lines').appendChild(p); });

    const lines = GAME.book.transcribed();
    $('#scripture').hidden = !(end.showTranscription && lines.length);
    $('#scripture').innerHTML = lines.map((t, i) => `<p><span class="num">${i + 1}.</span></p>`).join('');
    $('#scripture').querySelectorAll('p').forEach((p, i) => p.append(lines[i]));

    const faced = GAME.demons.faced();
    $('#companions').hidden = !(end.showCompanions && faced.length);
    $('#companions').innerHTML = faced.map(id => `<div class="companion">${GAME.ui.blobSVG(id)}<strong></strong><span></span></div>`).join('');
    $('#companions').querySelectorAll('.companion').forEach((c, i) => {
      c.querySelector('strong').textContent = GAME.demonText[faced[i]].name;
      c.querySelector('span').textContent = GAME.demonText[faced[i]].lesson;
    });

    $('#again').textContent = end.againButton || 'Play again';
    scrollTo({ top: 0 });
  }

  // ----- Choose boy or girl, then start -----
  GAME.player = { reader: null };
  $('#begin').addEventListener('click', () => { $('#title-screen').hidden = true; $('#choose').hidden = false; GAME.fx?.chooseIn(); });
  document.querySelectorAll('.choice').forEach(btn => btn.addEventListener('click', () => {
    GAME.player.reader = btn.dataset.reader;
    GAME.world.setReader(GAME.player.reader);
    $('#choose').hidden = true;
    start();
  }));
  $('#again').addEventListener('click', start);
})();
