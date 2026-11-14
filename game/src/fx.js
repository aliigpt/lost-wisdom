// =====================================================================
//  FX: motion and polish for menus, dialogue, the Book and demons (GSAP).
//  Everything here is optional decoration: the game works without it.
//  Respects the player's "reduce motion" setting.
// =====================================================================

import { gsap } from 'gsap';
import { TextPlugin } from 'gsap/TextPlugin';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';

gsap.registerPlugin(TextPlugin, ScrambleTextPlugin);
window.GAME = window.GAME || {};

(() => {
  const $ = s => document.querySelector(s);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const D = s => (reduce ? 0.01 : s);   // durations collapse when motion is reduced
  // pause an element's CSS transitions/animations while GSAP moves it, then hand it back to CSS
  const own = targets => { gsap.set(targets, { transition: 'none', animation: 'none' }); return () => gsap.set(targets, { clearProps: 'transition,animation,transform,opacity,filter' }); };

  // a full-screen flash layer (victory, lantern, etc.)
  const flash = document.createElement('div');
  Object.assign(flash.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '70', opacity: '0', background: 'radial-gradient(ellipse at center, rgba(220,232,255,.55), rgba(160,180,230,.15) 60%, transparent)' });
  document.body.appendChild(flash);

  const fx = {
    // ----- title: the name breathes into focus, then the rest follows -----
    titleIn() {
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      tl.fromTo('#title-heading', { opacity: 0, letterSpacing: '.45em', filter: 'blur(14px)', y: 24 },
        { opacity: 1, letterSpacing: '.04em', filter: 'blur(0px)', y: 0, duration: D(2.6) })
        .fromTo('#title-eyebrow', { opacity: 0 }, { opacity: 1, duration: D(.6) }, '-=1.6')
        .fromTo('#title-tagline', { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: D(1.2) }, '-=1.2')
        .fromTo('#begin', { opacity: 0, scale: .9 }, { opacity: 1, scale: 1, duration: D(.9), ease: 'back.out(1.6)' }, '-=.6')
        .fromTo('#title-screen .credits', { opacity: 0 }, { opacity: 1, duration: D(.8) }, '-=.4');
      if (!reduce) gsap.to('#begin', { filter: 'drop-shadow(0 0 14px rgba(241,216,146,.45)) drop-shadow(0 4px 8px rgba(0,0,0,.6))', duration: 1.6, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: 3 });
      return tl;
    },

    // ----- choose boy or girl: the cards rise in one after the other -----
    chooseIn() {
      gsap.fromTo('#choose .eyebrow', { opacity: 0, y: -10 }, { opacity: 1, y: 0, duration: D(.6) });
      const done = own('.choice');
      gsap.fromTo('.choice', { opacity: 0, y: 70, rotationX: 18, transformPerspective: 900 },
        { opacity: 1, y: 0, rotationX: 0, duration: D(1), stagger: D(.15), ease: 'power3.out', onComplete: done });
    },

    // ----- the camera swoops down from the sky to behind the Reader -----
    cameraIntro() {
      const follow = GAME.world && GAME.world.camFollow;
      if (!follow) return;
      gsap.fromTo(follow, { speed: .25 }, { speed: 6, duration: D(4.5), ease: 'power2.in' });
    },

    // ----- dialogue: the panel rises in; text writes itself out -----
    dialogueIn() {
      gsap.fromTo('.dialogue', { opacity: 0, y: 40, scale: .97 }, { opacity: 1, y: 0, scale: 1, duration: D(.7), ease: 'power3.out' });
    },
    type(el, text) {
      gsap.killTweensOf(el);
      el.textContent = '';
      return gsap.to(el, { text: { value: text }, duration: D(Math.min(3.2, text.length * .028)), ease: 'none' });
    },

    // ----- objectives slide in; the text decodes like an old script -----
    objective(el, text) {
      gsap.fromTo('#walk-hud', { opacity: 0, x: -40 }, { opacity: 1, x: 0, duration: D(.8), ease: 'power3.out' });
      gsap.to(el, { scrambleText: { text, chars: 'abcdefghijklmnopqrstuvwxyzþðæ', speed: .5, revealDelay: .2 }, duration: D(1.6) });
    },

    // ----- the Book opens like a heavy cover; symbols appear in turn -----
    bookOpen() {
      const done = own('.book, .page.right, #tray .chip');
      const tl = gsap.timeline({ onComplete: done });
      tl.fromTo('.book', { opacity: 0, y: 50, rotationX: -14, transformPerspective: 1400, transformOrigin: '50% 100%' },
        { opacity: 1, y: 0, rotationX: 0, duration: D(.9), ease: 'power3.out' })
        .fromTo('.page.right', { rotationY: -24, transformPerspective: 1400, transformOrigin: '0% 50%', opacity: .4 },
          { rotationY: 0, opacity: 1, duration: D(.8), ease: 'power2.out' }, '-=.55')
        .fromTo('#glyph-line .slot', { opacity: 0, y: 12, scale: .85 }, { opacity: 1, y: 0, scale: 1, duration: D(.5), stagger: D(.08), ease: 'back.out(1.8)' }, '-=.4')
        .fromTo('#tray .chip', { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: D(.45), stagger: D(.05), ease: 'power2.out' }, '-=.3');
      return tl;
    },

    // ----- the right word flies from the tray into its slot -----
    wordFly(chip, slot) {
      if (!chip || !slot) return;
      const word = slot.querySelector('.word'), a = chip.getBoundingClientRect(), b = word.getBoundingClientRect();
      const ghost = chip.cloneNode(true);
      Object.assign(ghost.style, { position: 'fixed', left: a.left + 'px', top: a.top + 'px', width: a.width + 'px', height: a.height + 'px', margin: '0', zIndex: '60', pointerEvents: 'none', transform: 'none' });
      ghost.classList.remove('used', 'wrong');
      document.body.appendChild(ghost);
      gsap.set(word, { opacity: 0 });
      gsap.timeline()
        .to(ghost, { x: (b.left + b.width / 2) - (a.left + a.width / 2), y: (b.top + b.height / 2) - (a.top + a.height / 2), scale: .75, rotation: 0, duration: D(.55), ease: 'power3.inOut' })
        .to(ghost, { opacity: 0, scale: .6, duration: D(.2) }, '-=.08')
        .add(() => ghost.remove())
        .to(word, { opacity: 1, duration: D(.25) }, '-=.2')
        .add(() => fx.glyphSolved(slot), '-=.25');
    },
    glyphSolved(slot) {
      const g = slot && slot.querySelector('.glyph');
      if (!g) return;
      const done = own(g);
      gsap.fromTo(g, { scale: 1.4, transformOrigin: '50% 50%', filter: 'drop-shadow(0 0 16px rgba(240,200,110,.95))' },
        { scale: 1, filter: 'drop-shadow(0 0 0px rgba(240,200,110,0))', duration: D(1.1), ease: 'elastic.out(1, .45)', onComplete: done });
    },
    wrong(...els) {
      els.filter(Boolean).forEach(el => gsap.fromTo(el, { x: 0 }, { keyframes: { x: [-11, 9, -6, 4, -2, 0] }, duration: D(.45), ease: 'none' }));
    },
    pageComplete() {
      const done = own('#turn');
      gsap.fromTo('#turn', { opacity: 0, x: -14 }, { opacity: 1, x: 0, duration: D(.6), delay: D(.8), onComplete: done });
      gsap.fromTo('#glyph-line .glyph', { scale: 1 }, { scale: 1.12, transformOrigin: '50% 50%', duration: D(.35), stagger: D(.06), yoyo: true, repeat: 1, ease: 'sine.inOut' });
    },

    // ----- demons: the card tears in out of a blur; the screen shudders -----
    demonIn() {
      gsap.fromTo('#veil', { opacity: 0 }, { opacity: 1, duration: D(.5) });
      const done = own('#demon-card');
      gsap.fromTo('#demon-card', { opacity: 0, scale: 1.3, x: 0, y: 0, xPercent: -50, yPercent: -50, filter: 'blur(14px)' }, { opacity: 1, scale: 1, filter: 'blur(0px)', duration: D(.9), ease: 'expo.out', onComplete: () => { done(); gsap.set('#demon-card', { animation: 'none' }); } });
      gsap.fromTo('#demon-blob .blob', { scale: .4, opacity: 0 }, { scale: 1, opacity: 1, duration: D(1.2), ease: 'elastic.out(1, .5)', delay: D(.2) });
      fx.shake(1);
    },
    shake(strength = 1) {
      if (reduce) return;
      const k = 9 * strength, frames = Array.from({ length: 9 }, (_, i) => ({ x: (Math.random() - .5) * k * (1 - i / 9), y: (Math.random() - .5) * k * (1 - i / 9) }));
      gsap.timeline().to('#app', { keyframes: frames, duration: .5, ease: 'none' }).set('#app', { x: 0, y: 0 });
    },
    victory() {
      gsap.fromTo(flash, { opacity: .85 }, { opacity: 0, duration: D(1.6), ease: 'power2.out' });
    },
    glimmer() {   // a small warm flash (a lantern lighting)
      gsap.fromTo(flash, { opacity: .35 }, { opacity: 0, duration: D(.9), ease: 'power2.out' });
    },

    // ----- the ending unfolds slowly -----
    endingIn() {
      gsap.timeline({ defaults: { ease: 'power2.out' } })
        .fromTo('#ending-title', { opacity: 0, letterSpacing: '.3em', filter: 'blur(10px)' }, { opacity: 1, letterSpacing: '0em', filter: 'blur(0px)', duration: D(2.4) })
        .fromTo('#ending-lines .lede', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: D(1.2), stagger: D(.6) }, '-=1')
        .fromTo('#scripture p', { opacity: 0, x: -12 }, { opacity: 1, x: 0, duration: D(.6), stagger: D(.25) }, '-=.4')
        .fromTo('.companion', { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: D(.8), stagger: D(.2) }, '-=.2')
        .fromTo('#again', { opacity: 0 }, { opacity: 1, duration: D(.8) });
    }
  };

  fx.gsap = gsap;   // exposed for screenshot tools (they turn off lag smoothing so animations finish on slow renderers)
  GAME.fx = fx;
})();
