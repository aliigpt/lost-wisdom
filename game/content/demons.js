// =====================================================================
//  DEMON TEXT: names and lines for each inner demon. Rewrite freely.
//  The ids (fog, flutter, quill, walls) are tied to their mechanics in
//  src/demons.js, so keep the ids; change everything else.
//
//    fog     → screen goes grey; cleared by placing one correct word
//    flutter → screen shakes; cleared by three held breaths
//    quill   → blank sheet covers the book; cleared by scribbling on it
//    walls   → town wall closes in; cleared by clicking three lanterns
// =====================================================================

window.GAME = window.GAME || {};

GAME.demonText = {
  fog: {
    name: 'The Fog',
    real: 'Depression',
    line: '"[Placeholder: what the demon says.]"',
    task: 'Place just one word you are sure of.',
    whisper: 'Just one word.',
    done: '[Placeholder: line when the demon is faced.]',
    lesson: '[Placeholder: what the player learned, shown at the end.]',
    eyes: 'sleepy'    // sleepy, wide, stern or small
  },
  flutter: {
    name: 'The Flutter',
    real: 'Anxiety',
    line: '"[Placeholder]"',
    task: 'Hold the lantern to breathe in. Let go to breathe out. Three breaths.',
    whisper: 'Breathe first.',
    done: '[Placeholder]',
    lesson: '[Placeholder]',
    eyes: 'wide'
  },
  quill: {
    name: 'The Stern Quill',
    real: 'Perfectionism',
    line: '"[Placeholder]"',
    task: 'Scribble one messy mark on the blank sheet.',
    whisper: 'Any mark.',
    done: '[Placeholder]',
    lesson: '[Placeholder]',
    eyes: 'stern'
  },
  walls: {
    name: 'The Closing Wall',
    real: 'Agoraphobia',
    line: '"[Placeholder]"',
    task: 'Find the three lanterns at the edges of the dark.',
    whisper: 'Look for the lanterns.',
    done: '[Placeholder]',
    lesson: '[Placeholder]',
    eyes: 'small'
  }
};
