// =====================================================================
//  AUDIO: ambience, footsteps, music and sound effects (Web Audio API).
//  Files live in public/audio/ (made with Higgsfield: Mirelo for sound
//  effects, ElevenLabs Music for the score).
//
//  Browsers only allow sound after the player clicks or presses a key, so
//  everything starts on the first interaction.
//
//    GAME.audio.play('quill')              one-off sound
//    GAME.audio.loop('battle-loop', .5)     fade a looping sound to a volume
//    GAME.audio.music('music-explore')      crossfade to a music track
// =====================================================================

window.GAME = window.GAME || {};

(() => {
  const FILES = ['wind', 'forest-night', 'river', 'steps-grass', 'steps-stone', 'steps-wood', 'battle-loop', 'heartbeat',
    'quill', 'page-turn', 'paper-knock', 'shimmer', 'demon-appear', 'demon-defeated', 'lantern', 'stone-rumble',
    'creature-roar', 'ui-click', 'music-explore', 'music-title'];
  const VOLUME = { master: .9, music: .35, ambience: .8, sfx: .9 };   // overall mix

  let ctx = null, master, buses = {};
  const buffers = {}, loops = {};
  let currentMusic = null, wantedMusic = null;

  function start() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = VOLUME.master;
    // a gentle compressor keeps loud moments (battles) from clipping
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3;
    master.connect(comp).connect(ctx.destination);
    for (const b of ['music', 'ambience', 'sfx']) { buses[b] = ctx.createGain(); buses[b].gain.value = VOLUME[b]; buses[b].connect(master); }
    FILES.forEach(name => fetch(`audio/${name}.mp3`).then(r => r.ok ? r.arrayBuffer() : Promise.reject())
      .then(d => ctx.decodeAudioData(d)).then(buf => { buffers[name] = buf; onLoaded(name); })
      .catch(() => console.info(`No sound at audio/${name}.mp3`)));
  }
  ['pointerdown', 'keydown'].forEach(ev => addEventListener(ev, start, { capture: true }));

  const bus = name => name.startsWith('music') ? buses.music : (/wind|forest|river|steps|battle|heartbeat/.test(name) ? buses.ambience : buses.sfx);

  // ----- loops: always running once loaded, faded in and out by volume -----
  function loop(name, volume, fade = 1.2, rate) {
    if (!ctx) return;
    let l = loops[name];
    if (!l) { l = loops[name] = { target: volume, rate: rate || 1 }; makeLoop(name); }
    l.target = volume;
    if (rate) l.rate = rate;
    if (l.gain) {
      const now = ctx.currentTime;
      l.gain.gain.cancelScheduledValues(now); l.gain.gain.setTargetAtTime(volume, now, fade / 3);
      if (rate) l.src.playbackRate.setTargetAtTime(rate, now, .15);
    }
  }
  function makeLoop(name) {
    const l = loops[name], buf = buffers[name];
    if (!buf || l.src) return;
    l.gain = ctx.createGain(); l.gain.gain.value = 0;
    l.src = ctx.createBufferSource(); l.src.buffer = buf; l.src.loop = true; l.src.playbackRate.value = l.rate;
    l.src.connect(l.gain).connect(bus(name));
    l.src.start(0, Math.random() * buf.duration);   // start somewhere random so repeats don't line up
    l.gain.gain.setTargetAtTime(l.target, ctx.currentTime, .5);
  }
  function onLoaded(name) {
    if (loops[name]) makeLoop(name);
    if (name === wantedMusic) music(name);
  }

  // ----- one-off sounds -----
  function play(name, volume = 1, rate = 1) {
    if (!ctx || !buffers[name]) return;
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = buffers[name]; src.playbackRate.value = rate * (.96 + Math.random() * .08);   // slight variation each time
    g.gain.value = volume; src.connect(g).connect(bus(name)); src.start();
    return src;
  }

  // ----- music: one track at a time, crossfaded -----
  function music(name, fade = 3) {
    wantedMusic = name;
    if (!ctx || !buffers[name] || currentMusic?.name === name) return;
    const now = ctx.currentTime;
    if (currentMusic) { const old = currentMusic; old.gain.gain.setTargetAtTime(0, now, fade / 3); setTimeout(() => old.src.stop(), fade * 2000); }
    const g = ctx.createGain(); g.gain.value = 0; g.gain.setTargetAtTime(1, now, fade / 3);
    const src = ctx.createBufferSource(); src.buffer = buffers[name]; src.loop = true; src.connect(g).connect(buses.music); src.start();
    currentMusic = { name, src, gain: g };
  }
  // quieter music during battles, back up afterwards
  function duckMusic(on) { if (ctx) buses.music.gain.setTargetAtTime(on ? VOLUME.music * .35 : VOLUME.music, ctx.currentTime, .8); }

  // ----- the living world: called by world.js every frame -----
  // gust 0..1.3, mood 0..1 (demon), riverDist (m), speed (m/s), surface: grass | stone | wood
  let lastSurface = null;
  function update({ gust, mood, riverDist, speed, surface, exploring }) {
    if (!ctx) return;
    loop('wind', .22 + gust * .45 + mood * .2, 1.5);
    loop('forest-night', (.55 - mood * .4) * (exploring ? 1 : .6), 2);
    loop('river', Math.max(0, 1 - riverDist / 55) ** 1.6 * .9, 1.5);
    const moving = speed > .3;
    ['grass', 'stone', 'wood'].forEach(s => loop(`steps-${s}`, moving && s === surface ? .55 : 0, .12, Math.max(.7, speed / 2)));
    lastSurface = surface;
  }

  GAME.audio = { start, play, loop, music, duckMusic, update };
})();
