// =====================================================================
//  YOUR ALPHABET: one symbol per word.
//  Each symbol is an SVG path drawn on a 40 x 40 grid.
//
//  To make your own: draw on a 40x40 canvas in Figma, Inkscape or
//  any SVG editor, export as SVG, and copy the d="..." of the path.
//  Every word used in a page (script.js) needs an entry here.
//  These are placeholders.
// =====================================================================

window.GAME = window.GAME || {};

GAME.glyphs = {
  child:  'M20 5 a5 5 0 1 1 -0.01 0 M20 15 V29 M13 35 L20 29 L27 35 M14 21 H26',
  walks:  'M7 31 L15 14 L22 26 L30 9 M27 31 H35',
  toward: 'M6 12 V28 M6 20 H31 M24 13 L32 20 L24 27',
  light:  'M14 20 a6 6 0 1 0 12 0 a6 6 0 1 0 -12 0 M20 4 V9 M20 31 V36 M4 20 H9 M31 20 H36 M9 9 L12 12 M31 9 L28 12',
  shadow: 'M12 7 Q28 20 12 33 M21 7 Q37 20 21 33',
  with:   'M10 9 V31 M30 9 V31 M10 20 Q20 12 30 20',
  rain:   'M10 7 L8 15 M20 5 L18 13 M30 7 L28 15 M15 21 L13 29 M25 21 L23 29',
  falls:  'M20 5 V31 M12 23 L20 33 L28 23',
  on:     'M7 30 H33 M20 9 V24 M14 15 L20 9 L26 15',
  one:    'M20 6 V34 M14 12 L20 6 M15 34 H25',
  step:   'M6 32 H13 V25 H20 V18 H27 V11 H34',
  and:    'M8 12 Q20 36 32 12 M20 5 V13',
  become: 'M7 20 a7 7 0 1 0 14 0 a7 7 0 1 0 -14 0 M19 20 a7 7 0 1 0 14 0 a7 7 0 1 0 -14 0'
};
