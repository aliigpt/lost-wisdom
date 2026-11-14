# Lost Wisdom

A cozy puzzle game in a 3D walled town. You transcribe a lost language while your inner demons get in the way.

## Folders

```
lost-wisdom/
├── design/                      planning, not part of the game
│   ├── game-doc.md              the main design document
│   ├── inspiration/             your reference images (drop them in here)
│   │   ├── ui/                  menus, books, dialogue boxes, fonts you like
│   │   ├── world/               towns, places, lighting
│   │   ├── characters/          the reader, the demons, other people
│   │   └── mood/                colors, weather, anything that feels right
│   ├── ui-sketches/             UI layouts, made from your inspiration
│   └── story/
│       ├── story-outline.md     your story (blank template)
│       └── reference-claude-draft.md   an early draft by Claude, optional to keep
│
└── game/                        the playable game
    ├── index.html               page structure, loads everything below
    ├── css/style.css            how it looks (placeholder until the UI is redesigned)
    ├── content/                 ✏️ YOUR WRITING, no coding needed
    │   ├── script.js            the whole story in order: scenes, pages, title, ending
    │   ├── demons.js            what each demon is called and says
    │   ├── glyphs.js            the symbols of your invented language
    │   └── pictures.js          clue pictures for each page
    ├── src/                     game code
    │   ├── main.js              runs the script step by step
    │   ├── book.js              the transcription puzzle
    │   ├── scenes.js            dialogue and narration between pages
    │   ├── demons.js            how each demon works
    │   ├── world.js             the 3D town (Three.js)
    │   └── ui.js                small shared helpers
    └── assets/                  your own art and sound
```

## What to edit for what

| I want to… | Edit |
|---|---|
| Write story scenes or dialogue | `game/content/script.js` (`type: 'scene'`) |
| Write or change a page | `game/content/script.js` (`type: 'page'`) |
| Change the title or ending text | `game/content/script.js` (top and bottom) |
| Rename a demon or change what it says | `game/content/demons.js` |
| Add a symbol for a new word | `game/content/glyphs.js` |
| Use my own picture on a page | put it in `game/assets/`, then `picture: 'assets/name.png'` |
| Change colors, fonts, layout | `game/css/style.css` |

Everything in `content/` is placeholder text marked `[Placeholder]`. Replace it with your own.

## Playing it

The game uses 3D model files, which browsers only load from a web server, so double-clicking `index.html` won't work. Instead:

1. Install [Node.js](https://nodejs.org) (the LTS version), once.
2. In VS Code, open the `lost-wisdom` folder, then open a terminal (Terminal → New Terminal).
3. The first time only, run `npm install`.
4. Run `npm run dev`. The game opens in your browser. Leave the terminal running while you play; changes you save show up right away.

Controls: WASD or arrow keys to walk, Shift to run, drag to look around. On phones, use the joystick.

## Adding models from Higgsfield

Put the `.glb` file in `game/public/models/` with the name the game expects (for example `cottage.glb`), then run `npm run optimize-models` to shrink its textures.

If something doesn't show up, open the browser console (F12). The game prints a warning when a word has no symbol, or when a page uses a picture that doesn't exist.
