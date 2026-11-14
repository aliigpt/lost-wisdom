// =====================================================================
//  DEMON MECHANICS: what each demon does and how you get past it.
//  The words they say live in content/demons.js.
// =====================================================================

window.GAME = window.GAME || {};

(() => {
  const { $, whisper } = GAME.ui;
  let active = null, phase = null;
  const faced = [];
  const text = id => GAME.demonText[id];

  // ----- Encounter flow: card -> task -> resolved -----
  function start(id) {
    if (!text(id)) { console.warn(`Unknown demon "${id}". Use fog, flutter, quill or walls.`); return; }
    const d = text(id);
    active = id; phase = 'card';
    GAME.setWeather(true);
    GAME.world.summon(id);
    GAME.audio?.play('demon-appear', 1); GAME.audio?.loop('battle-loop', .75, 2); GAME.audio?.duckMusic(true);
    $('#demon-blob').innerHTML = GAME.ui.blobSVG(id);
    $('#demon-real').textContent = d.real;
    $('#demon-name').textContent = d.name;
    $('#demon-line').textContent = d.line;
    $('#demon-task').textContent = d.task;
    $('#veil').hidden = false; $('#demon-card').hidden = false;
    $('#demon-go').focus();
  }

  function beginTask() {
    const id = active;
    $('#veil').hidden = true; $('#demon-card').hidden = true;
    phase = 'task';
    document.body.classList.add('demon-' + id);
    whisper(text(id).whisper, true);
    if (id === 'fog') GAME.world.fog(true);
    if (id === 'flutter') { GAME.world.shake(true); startBreath(); GAME.audio?.loop('heartbeat', .85, .5); }
    if (id === 'quill') startQuill();
    if (id === 'walls') startWalls();
  }

  function resolve() {
    const id = active;
    document.body.classList.remove('demon-' + id);
    active = null; phase = null;
    if (!faced.includes(id)) faced.push(id);
    GAME.world.fog(false); GAME.world.shake(false); GAME.world.settle(id);
    GAME.audio?.play('demon-defeated', 1); GAME.audio?.loop('battle-loop', 0, 3); GAME.audio?.loop('heartbeat', 0, 1.5); GAME.audio?.duckMusic(false);
    GAME.setWeather(false);
    whisper(text(id).done);
  }

  // ----- Flutter: hold to breathe in, release to breathe out, x3 -----
  const br = { p: 0, holding: false, peaked: false, count: 0, last: 0, on: false };
  function startBreath() {
    Object.assign(br, { p: 0, holding: false, peaked: false, count: 0, last: performance.now(), on: true });
    document.querySelectorAll('.breath-dots span').forEach(s => s.classList.remove('on'));
    $('#breath').hidden = false;
    requestAnimationFrame(breathTick);
  }
  function breathTick(now) {
    if (!br.on) return;
    const dt = Math.min(.5, (now - br.last) / 1000); br.last = now; // real time, even on slow devices
    br.p = br.holding ? Math.min(1, br.p + dt / 3) : Math.max(0, br.p - dt / 3);
    if (br.p >= 1) br.peaked = true;
    if (br.peaked && !br.holding && br.p <= 0.02) {
      br.peaked = false; br.count++;
      document.querySelectorAll('.breath-dots span').forEach((s, i) => s.classList.toggle('on', i < br.count));
      if (br.count >= 3) { br.on = false; setTimeout(() => { $('#breath').hidden = true; resolve(); }, 500); }
    }
    $('#breath-core').style.transform = `scale(${.3 + .7 * br.p})`;
    $('#breath-label').textContent = br.holding
      ? (br.p >= 1 ? 'Now let go, slowly.' : 'Breathe in…')
      : (br.peaked ? 'Breathe out…' : br.count ? 'Again. Hold the lantern.' : 'Hold the lantern to breathe in.');
    requestAnimationFrame(breathTick);
  }
  const bb = $('#breath-btn');
  bb.addEventListener('pointerdown', e => { br.holding = true; bb.setPointerCapture(e.pointerId); e.preventDefault(); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => bb.addEventListener(ev, () => { br.holding = false; }));
  bb.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { br.holding = true; e.preventDefault(); } });
  bb.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') br.holding = false; });

  // ----- Stern Quill: scribble on a blank sheet -----
  function startQuill() {
    const q = document.createElement('div');
    q.id = 'quill';
    q.innerHTML = `<p class="q-line"></p><p class="q-task">Scribble here with your finger or mouse.</p><canvas aria-label="Blank sheet to scribble on"></canvas>`;
    q.querySelector('.q-line').textContent = text('quill').line;
    $('#book').appendChild(q);
    const cv = q.querySelector('canvas'), cx = cv.getContext('2d');
    const r = cv.getBoundingClientRect(), k = Math.min(2, devicePixelRatio || 1);
    cv.width = r.width * k; cv.height = r.height * k; cx.scale(k, k);
    cx.lineWidth = 3; cx.lineCap = 'round'; cx.lineJoin = 'round';
    cx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--ink');
    let down = false, lx = 0, ly = 0, len = 0, finished = false, scratch = 0;
    const pos = e => { const b = cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
    cv.addEventListener('pointerdown', e => { down = true; [lx, ly] = pos(e); cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', e => {
      if (!down || finished) return;
      const [x, y] = pos(e);
      cx.beginPath(); cx.moveTo(lx, ly); cx.lineTo(x, y); cx.stroke();
      const step = Math.hypot(x - lx, y - ly); len += step; lx = x; ly = y;
      scratch += step; if (scratch > 90) { scratch = 0; GAME.audio?.play('quill', .7, 1.2); }   // the quill scratches as you scribble
      if (len > 420) {
        finished = true;
        q.querySelector('.q-task').textContent = 'There. Messy, and it counts.';
        setTimeout(() => { q.style.transition = 'opacity .8s'; q.style.opacity = 0; setTimeout(() => q.remove(), 800); resolve(); }, 700);
      }
    });
    ['pointerup', 'pointercancel'].forEach(ev => cv.addEventListener(ev, () => { down = false; }));
  }

  // ----- Closing Wall: the 3D wall closes in; three lanterns push it back -----
  function startWalls() {
    if (!GAME.world.ok) { setTimeout(resolve, 2500); return; } // no 3D available: let it pass
    GAME.world.walls(lit => {
      if (lit < 3) whisper(`${lit} of 3 lanterns lit. The wall steps back a little.`, true);
      else resolve();
    });
  }

  $('#demon-go').addEventListener('click', beginTask);

  GAME.demons = {
    start,
    // true while a demon stops the player from placing words
    blocked() {
      if (!active) return false;
      if (phase === 'card') return true;
      if (active === 'fog') return false;
      whisper(text(active).whisper, true);
      return true;
    },
    // called by the book after every correct word; returns true if it cleared the Fog
    onCorrectWord() { if (active === 'fog' && phase === 'task') { resolve(); return true; } return false; },
    faced: () => faced.slice(),
    reset() {
      active = null; phase = null; faced.length = 0; br.on = false;
      ['fog', 'flutter', 'quill', 'walls'].forEach(id => document.body.classList.remove('demon-' + id));
      $('#breath').hidden = true; $('#veil').hidden = true; $('#demon-card').hidden = true;
      const q = $('#quill'); if (q) q.remove();
    }
  };
})();
