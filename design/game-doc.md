# Lost Wisdom — game doc

Living document. Update it whenever a decision changes.

**Who does what:** the story, every page and all game text are written by you (`story/story-outline.md`, then `game/content/`). The UI will be redesigned from your references in `inspiration/`. Claude handles the code.

## Pitch

A cozy puzzle game. A small reader in a walled town transcribes a forgotten holy book into English, one symbol at a time, while pieces of their own shadow (their inner demons) keep getting in the way.

**Message:** It's okay to have inner demons. Take it one step at a time, face them one step at a time, and you get stronger.

## Pillars

1. **Deciphering feels clever.** The player works out meanings from pictures, repetition and context. Nothing is handed over.
2. **Demons interrupt, they don't punish.** No game over, no lives. Each demon asks for one small, kind action to get past it.
3. **The weather is the mood.** Sunny and warm when calm, cold and rainy when a demon is near.

## Core loop

1. Open a folio (page) of the Book.
2. Look at the margin picture for clues.
3. Tap a symbol, tap the English word you think it means.
   - Right: the symbol turns gold and goes into your lexicon. Every copy of it on later pages fills in by itself.
   - Wrong: the slip bounces back with a gentle line. No penalty.
4. When every symbol is solved, the full sentence appears in proper English.
5. Turn the page. Sometimes a demon is waiting.

Over time the lexicon grows, so later pages are part known and part new. That's what makes the deduction work.

## The demons

They are the four pieces of the shadow the child lost at the town gate (see `story/lore.md`).

| Demon | What it is | What it does to the screen | How you get past it |
|---|---|---|---|
| The Fog | Depression, no will to start | Colors drain, rain, word slips go dim and slow | Place just one word you're sure of |
| The Flutter | Anxiety, fear of getting it wrong | Symbols tremble, heartbeat, words locked | Hold to breathe in, release to breathe out, three times |
| The Stern Quill | Perfectionism, can't start | A blank sheet covers the book | Scribble one messy mark on it |
| The Closing Wall | Agoraphobia, the world shrinks | Everything goes dark except a small circle | Find three lanterns at the edges of the dark |

Ideas for later demons: Guilt, Loneliness, Comparison (another reader's perfect page appears beside yours).

## Look and feel

Storybook, hand-inked, warm paper. Two moods that blend into each other:

- **Calm:** honey-gold sky, warm paper, ink-brown, gold for solved symbols.
- **Demon:** slate-blue sky, rain, cold grey paper.

Type: an old printed-book serif for the Book and titles, a soft rounded sans for the interface.

## Screens

1. **Title** — "Lost Wisdom", a small walled town, Begin.
2. **Archive (gameplay)** — open book: picture + translation on the left, symbols on the right. Word slips and lexicon below.
3. **Demon encounter** — a card that names the demon, then its effect over the book.
4. **Ending** — the whole transcription, the four demons walking beside the reader, closing message.

Later: character pick (boy or girl reader), chapter map of the town, settings.

## Scope

**Prototype (built):** 3D town, title, scene/dialogue system, transcription puzzle, all four demons, ending. Content is placeholder, waiting for your writing.

**Version 1:**
- 3 chapters, about 15 folios each
- Grammar marks in the Old Tongue (plural dot, past-tense stroke) to deepen the puzzles
- Character choice
- Short scenes with the Archivist between chapters
- Sound: rain, page turns, a soft music box theme
- Save progress

**Maybe later:** the Waking Side chapters (see lore), a dictionary you can annotate by hand, collectible moth-lanterns.

## Tech

- **3D world:** Three.js (0.149, loaded from a CDN). The Hollow is a low-poly walled town: Archive tower with a handless clock, houses, ring wall, the Reader, moth-lanterns, rain.
- **Puzzle UI:** plain HTML/CSS on top of the 3D canvas. Text-heavy puzzles read better as HTML than as 3D text.
- Code is split by job (`game/src/`), and all writing lives in `game/content/`. See the README for which file does what.
- The game plays `content/script.js` in order: scenes (dialogue) and pages (puzzles), so the story can be much more than transcribing.

How the demons use the 3D world:

| Demon | In 3D |
|---|---|
| The Fog | Scene fog thickens, colors go grey, sun fades |
| The Flutter | Camera shakes, window lights flicker |
| The Stern Quill | Rain and cold light (main effect is the blank sheet over the book) |
| The Closing Wall | The ring wall shrinks inward and rises, houses vanish, camera is pushed in. Clicking three lanterns in the scene pushes it back step by step |

Every demon appears as a big shadow creature beside the Reader. Once faced, it shrinks into a small companion that follows the Reader around for the rest of the game.
