// =====================================================================
//  MAIN: starts the 3D world and plays content/script.js step by step.
// =====================================================================

window.GAME = window.GAME || {};

(() => {
  const { $ } = GAME.ui;

  GAME.world = GAME.createWorld($('#world'));
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
    if (item.type === 'scene') GAME.scenes.play(item, next);
    else if (item.type === 'page') GAME.book.open(item, pages.indexOf(item), pages.length, step === script.length - 1, next);
    else { console.warn('Unknown step type in script.js:', item); next(); }
  }
  function next() {
    step++;
    scrollTo({ top: 0, behavior: GAME.ui.reduce ? 'auto' : 'smooth' });
    run();
  }

  function start() {
    ['#title-screen', '#ending', '#game', '#scene'].forEach(s => { $(s).hidden = true; });
    GAME.book.reset(); GAME.demons.reset(); GAME.world.reset();
    GAME.setWeather(false);
    script = GAME.script || [];
    pages = script.filter(s => s.type === 'page');
    step = 0;
    run();
  }

  // ----- Ending -----
  function showEnding() {
    const end = GAME.ending || {};
    $('#game').hidden = true; $('#scene').hidden = true; $('#ending').hidden = false;
    $('#ending-title').textContent = end.title || '';
    $('#ending-lines').innerHTML = '';
    (end.lines || []).forEach(t => { const p = document.createElement('p'); p.className = 'lede'; p.textContent = t; $('#ending-lines').appendChild(p); });

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

  $('#begin').addEventListener('click', start);
  $('#again').addEventListener('click', start);
})();
