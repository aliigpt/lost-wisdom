// =====================================================================
//  CLUE PICTURES: drawn in the book's margin next to each page.
//  Simple SVG drawings on a 200 x 120 grid. Placeholders.
//
//  Easier option: put your own image in game/assets/ and write
//  picture: 'assets/your-image.png' in script.js instead.
// =====================================================================

window.GAME = window.GAME || {};

(() => {
  // a little stick figure at (x, y); cls 'ghost' draws it dashed
  const FIG = (x, y, cls = '') => `<g class="${cls}"><circle cx="${x}" cy="${y}" r="5"/><path d="M${x} ${y + 5} V${y + 20} M${x} ${y + 20} L${x - 5} ${y + 30} M${x} ${y + 20} L${x + 6} ${y + 29} M${x} ${y + 10} L${x - 6} ${y + 16} M${x} ${y + 10} L${x + 7} ${y + 14}"/></g>`;

  GAME.pictures = {
    sun: `<path d="M0 102 Q50 86 100 98 T200 92"/><circle class="sunfill" cx="160" cy="32" r="13"/>
          <path d="M160 10 V14 M160 50 V54 M138 32 H142 M178 32 H182 M145 17 L148 20 M175 17 L172 20"/>
          ${FIG(40, 64)}<path d="M54 92 Q100 82 136 52" stroke-dasharray="3 7"/>`,
    shadow: `<path d="M0 100 H200"/><circle class="sunfill" cx="22" cy="40" r="11"/>
          ${FIG(80, 64)}${FIG(110, 64, 'ghost')}<path class="shade" d="M84 99 L182 104 L180 96 Z"/>`,
    rain: `<path d="M60 40 Q60 22 80 24 Q88 8 108 16 Q126 10 132 28 Q148 30 144 44 Z"/>
          <path d="M70 52 L66 62 M90 50 L86 60 M110 52 L106 62 M130 50 L126 60 M80 70 L76 80 M120 70 L116 80"/>
          <path d="M0 108 H200"/>${FIG(100, 76)}<path d="M93 78 Q100 64 107 78"/>`,
    step: `<path d="M18 108 H52 V88 H86 V68 H120 V48 H154 V30 H190"/><circle class="sunfill" cx="176" cy="16" r="9"/>${FIG(34, 76)}`,
    become: `<circle class="sunfill" cx="100" cy="56" r="34" style="opacity:.25"/>${FIG(96, 40)}${FIG(104, 40, 'ghost')}
          <path d="M0 104 H200"/>`
  };
})();
