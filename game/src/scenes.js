// =====================================================================
//  SCENES: story moments between pages (dialogue and narration).
//  Scene text comes from content/script.js.
// =====================================================================

window.GAME = window.GAME || {};

(() => {
  const { $ } = GAME.ui;
  let lines = [], i = 0, onDone = null;

  function play(scene, done) {
    if (scene.weather) GAME.setWeather(scene.weather === 'rain');
    lines = scene.lines || []; i = 0; onDone = done;
    $('#scene').hidden = false;
    show();
  }

  function show() {
    const line = lines[i];
    if (!line) return finish();
    const who = $('#scene-who');
    who.textContent = GAME.ui.say(line.who || '');
    who.hidden = !line.who;
    $('#scene-text').textContent = GAME.ui.say(line.text || '');
    $('#scene-next').textContent = i === lines.length - 1 ? 'Continue' : 'Next';
    $('#scene-next').focus();
  }

  function finish() {
    $('#scene').hidden = true;
    onDone && onDone();
  }

  $('#scene-next').addEventListener('click', () => { i++; show(); });

  GAME.scenes = { play };
})();
