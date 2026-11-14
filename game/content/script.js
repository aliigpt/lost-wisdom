// =====================================================================
//  YOUR STORY: the whole game, in the order it plays.
//  Edit this file freely. Everything below is PLACEHOLDER text so the
//  game runs; replace it with your own writing.
// =====================================================================

window.GAME = window.GAME || {};

// ----- Title screen -----
GAME.info = {
  title: 'Lost Wisdom',
  eyebrow: '[placeholder eyebrow]',
  tagline: '[Placeholder tagline. One or two sentences that set the mood.]',
  startButton: 'Begin'
};

// ----- The story, step by step -----
// There are two kinds of steps:
//
// 1. A SCENE: story moments, dialogue, narration.
//    {
//      type: 'scene',
//      weather: 'sun' or 'rain',            (optional, changes the 3D sky)
//      lines: [
//        { who: 'Name', text: 'What they say.' },
//        { text: 'Narration has no "who".' }
//      ]
//    }
//
// 2. A PAGE: a transcription puzzle.
//    {
//      type: 'page',
//      words:   ['word', 'word', ...],   symbols shown, in order (each needs a symbol in glyphs.js)
//      english: 'The finished sentence.', shown when the page is solved
//      decoys:  ['word', 'word'],         wrong answers mixed into the word slips
//      picture: 'sun',                    a clue picture from pictures.js, OR an image file like 'assets/page1.png'
//      intro:   'Line shown when the page opens.',
//      demon:   'fog'                     (optional) one of: fog, flutter, quill, walls  (see demons.js)
//    }

GAME.script = [
  {
    type: 'scene',
    weather: 'sun',
    lines: [
      { text: '[Placeholder narration. Your opening goes here.]' },
      { who: '[Character]', text: '[Placeholder line of dialogue.]' },
      { who: '[Reader]', text: '[Placeholder reply.]' }
    ]
  },
  {
    type: 'page',
    words: ['child', 'walks', 'toward', 'light'],
    english: '[Placeholder] The child walks toward the light.',
    decoys: ['rain', 'door'],
    picture: 'sun',
    intro: '[Placeholder: line shown when this page opens.]'
  },
  {
    type: 'scene',
    weather: 'rain',
    lines: [
      { text: '[Placeholder: something happens between pages. The weather turns.]' }
    ]
  },
  {
    type: 'page',
    words: ['shadow', 'walks', 'with', 'child'],
    english: '[Placeholder] A shadow walks with the child.',
    decoys: ['heart', 'gate'],
    picture: 'shadow',
    intro: '[Placeholder: this page has a demon attached.]',
    demon: 'fog'
  }
];

// ----- Ending screen -----
GAME.ending = {
  title: '[Placeholder ending title]',
  lines: [
    '[Placeholder closing paragraph.]',
    'It\'s okay to have inner demons. Take it one step at a time.'
  ],
  showTranscription: true,   // list every sentence the player transcribed
  showCompanions: true,      // show the demons the player faced
  againButton: 'Play again'
};
