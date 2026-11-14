// =====================================================================
//  SHARED HELPERS used by the other src/ files.
// =====================================================================

window.GAME = window.GAME || {};

GAME.ui = {
  $: s => document.querySelector(s),

  reduce: matchMedia('(prefers-reduced-motion: reduce)').matches,

  // Boy/girl text: "{he|she} opens the door" -> first option for the boy, second for the girl
  say(txt) {
    const girl = GAME.player && GAME.player.reader === 'girl';
    return String(txt ?? '').replace(/\{([^{}|]*)\|([^{}]*)\}/g, (_, boy, g) => (girl ? g : boy));
  },

  // The narration line above the book
  whisper(txt, demon = false) {
    const w = document.querySelector('#whisper');
    w.textContent = GAME.ui.say(txt);
    w.classList.toggle('demon', demon);
  },

  // Draw a symbol from content/glyphs.js (a red X if it's missing)
  glyphSVG(id) {
    const d = GAME.glyphs[id];
    if (!d) console.warn(`No symbol for "${id}". Add it to content/glyphs.js`);
    return `<svg class="glyph" viewBox="0 0 40 40" aria-hidden="true"><path d="${d || 'M8 8 L32 32 M32 8 L8 32'}"/></svg>`;
  },

  // The 2D shadow-creature drawing for a demon
  blobSVG(id) {
    const e = (GAME.demonText[id] || {}).eyes || 'small';
    const eyes = {
      sleepy: '<ellipse cx="38" cy="46" rx="7" ry="2.2"/><ellipse cx="62" cy="46" rx="7" ry="2.2"/>',
      wide: '<circle cx="38" cy="44" r="8"/><circle cx="62" cy="44" r="8"/>',
      stern: '<circle cx="38" cy="46" r="5"/><circle cx="62" cy="46" r="5"/><path d="M28 34 L46 40 M72 34 L54 40" stroke="#f2d48a" stroke-width="3" stroke-linecap="round"/>',
      small: '<circle cx="42" cy="46" r="3.5"/><circle cx="58" cy="46" r="3.5"/>'
    }[e];
    return `<svg class="blob ${id}" viewBox="0 0 100 90" aria-hidden="true">
      <path fill="#0f0e17" stroke="#3a3650" stroke-width="1.5" d="M50 8 C78 8 90 30 90 52 C90 70 82 84 74 80 C68 77 66 86 58 82 C52 79 48 88 42 82 C36 77 30 86 24 80 C14 74 10 64 10 50 C10 28 22 8 50 8Z"/>
      <g fill="#f2d48a">${eyes}</g></svg>`;
  }
};
