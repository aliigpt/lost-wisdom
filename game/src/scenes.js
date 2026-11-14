// =====================================================================
//  SCENES: story moments between pages (dialogue and narration).
//  Scene text comes from content/script.js.
// =====================================================================

window.GAME = window.GAME || {};

(() => {
  const { $ } = GAME.ui;
  let lines = [], i = 0, onDone = null, typing = null;

  function play(scene, done) {
    if (scene.weather) GAME.setWeather(scene.weather === 'rain');
    lines = scene.lines || []; i = 0; onDone = done;
    $('#scene').hidden = false;
    GAME.fx?.dialogueIn();
    show();
  }

  function show() {
    const line = lines[i];
    if (!line) return finish();
    const who = $('#scene-who');
    who.textContent = GAME.ui.say(line.who || '');
    who.hidden = !line.who;
    const text = GAME.ui.say(line.text || '');
    if (GAME.fx) typing = GAME.fx.type($('#scene-text'), text);   // writes itself out
    else $('#scene-text').textContent = text;
    $('#scene-next').textContent = i === lines.length - 1 ? 'Continue' : 'Next';
    $('#scene-next').focus();
  }

  function finish() {
    $('#scene').hidden = true;
    const cb = onDone; onDone = null;   // a scene finishes exactly once, however fast Next is clicked
    cb && cb();
  }

  // first click finishes the line being written; the next one moves on
  $('#scene-next').addEventListener('click', () => {
    if (!onDone || $('#scene').hidden) return;   // ignore clicks after the scene has ended
    if (typing && typing.isActive()) { typing.progress(1); return; }
    i++; show();
  });

  GAME.scenes = { play };
})();
