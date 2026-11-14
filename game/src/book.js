// =====================================================================
//  THE BOOK: the transcription puzzle for one page.
//  Page content comes from content/script.js.
// =====================================================================

window.GAME = window.GAME || {};

(() => {
  const { $, whisper, glyphSVG } = GAME.ui;
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];
  const WRONG = ['Not that one. That\'s okay.', 'Look at the margin picture again.', 'Every reader guesses wrong sometimes.', 'Close. Try another slip.'];
  const IMAGE = /\.(png|jpe?g|gif|webp|svg|avif)$/i;

  let page, pageNo, total, isLast, onDone;
  let known = {}, order = [], selected = null, wrongN = 0, transcribed = [];

  const firstOpen = () => page.words.findIndex(w => !known[w]);
  const folio = n => ROMAN[n] || String(n + 1);

  function open(p, no, count, last, done) {
    page = p; pageNo = no; total = count; isLast = last; onDone = done;
    $('#game').hidden = false;
    selected = firstOpen();
    renderPicture();
    const tr = $('#translation'); tr.textContent = GAME.ui.say(p.english || ''); tr.classList.remove('show');
    $('#turn').hidden = true;
    $('#glyph-line').classList.remove('complete');
    $('#folio-l').textContent = `folio ${folio(no)}, recto`;
    $('#folio-r').textContent = `folio ${folio(no)}, verso`;
    renderGlyphs(); renderTray(); renderPips(); renderLexicon();
    whisper(p.intro || '');
    GAME.audio?.play('page-turn', .8);
    if (p.demon) setTimeout(() => GAME.demons.start(p.demon), 1400);
    if (firstOpen() < 0) completePage(); // every word already known
  }

  function renderPicture() {
    const pic = page.picture;
    if (pic && IMAGE.test(pic)) { $('#illus').innerHTML = `<img class="illus" src="${pic}" alt="">`; return; }
    if (pic && !GAME.pictures[pic]) console.warn(`No picture called "${pic}". Add it to content/pictures.js`);
    $('#illus').innerHTML = `<svg class="illus" viewBox="0 0 200 120" aria-hidden="true">${GAME.pictures[pic] || ''}</svg>`;
  }
  function renderPips() {
    $('#pips').innerHTML = Array.from({ length: total }, (_, i) => `<span class="pip ${i < pageNo ? 'done' : i === pageNo ? 'now' : ''}"></span>`).join('');
  }
  function renderLexicon() {
    $('#lexicon-list').innerHTML = order.length
      ? order.map(w => `<span class="entry">${glyphSVG(w)}${w}</span>`).join('')
      : '<span class="empty">Solved symbols are kept here.</span>';
  }
  function renderGlyphs(fresh) {
    $('#glyph-line').innerHTML = page.words.map((w, i) => {
      const ok = !!known[w];
      return `<button class="slot ${ok ? 'solved' : ''} ${ok && fresh === w ? 'fresh' : ''} ${selected === i ? 'selected' : ''}" data-i="${i}"
        aria-label="Symbol ${i + 1} of ${page.words.length}, ${ok ? w : 'unknown'}">${glyphSVG(w)}<span class="word">${ok ? w : ''}</span></button>`;
    }).join('');
  }
  function renderTray() {
    const real = [...new Set(page.words.filter(w => !known[w]))];
    const decoys = (page.decoys || []).filter(d => !page.words.includes(d));
    const slips = [...real, ...decoys].sort(() => Math.random() - .5);
    $('#tray').innerHTML = slips.map(w => `<button class="chip" data-w="${w}" style="--tilt:${(Math.random() * 4 - 2).toFixed(1)}deg">${w}</button>`).join('');
  }

  function select(i) {
    if (known[page.words[i]]) return;
    selected = i; renderGlyphs();
  }

  function assign(word, chipEl) {
    if (GAME.demons.blocked()) return;
    let i = selected;
    if (i == null || i < 0 || known[page.words[i]]) i = firstOpen();
    if (i < 0) return;
    const target = page.words[i];
    if (word === target) {
      known[target] = true; order.push(target);
      chipEl.classList.add('used');
      GAME.audio?.play('quill', .9); setTimeout(() => GAME.audio?.play('shimmer', .45), 350);
      selected = firstOpen();
      renderGlyphs(target); renderLexicon();
      if (!GAME.demons.onCorrectWord()) whisper(`"${target}". It goes into your lexicon.`);
      if (firstOpen() < 0) completePage();
    } else {
      const slot = document.querySelector(`.slot[data-i="${i}"]`);
      [slot, chipEl].forEach(el => { el.classList.remove('wrong'); void el.offsetWidth; el.classList.add('wrong'); });
      GAME.audio?.play('paper-knock', .8);
      whisper(WRONG[wrongN++ % WRONG.length]);
    }
  }

  function completePage() {
    transcribed.push(GAME.ui.say(page.english || page.words.join(' ')));
    $('#glyph-line').classList.add('complete');
    $('#translation').classList.add('show');
    GAME.world.celebrate();
    const t = $('#turn'); t.textContent = isLast ? 'Close the Book' : 'Turn the page'; t.hidden = false;
    whisper('The line glows softly.');
  }

  $('#turn').addEventListener('click', () => { GAME.audio?.play('page-turn', .8); $('#game').hidden = true; onDone && onDone(); });
  $('#glyph-line').addEventListener('click', e => { const s = e.target.closest('.slot'); if (s) select(+s.dataset.i); });
  $('#tray').addEventListener('click', e => { const c = e.target.closest('.chip'); if (c) assign(c.dataset.w, c); });

  GAME.book = {
    open,
    transcribed: () => transcribed.slice(),
    reset() { known = {}; order = []; transcribed = []; wrongN = 0; }
  };
})();
