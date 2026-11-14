# Lost Wisdom — devlog

How the game got from an idea to a moonlit forest you can walk through.

## 1. The idea
A cozy puzzle game in an imaginary world: you transcribe a lost language into English, but your inner demons keep getting in the way. Depression, anxiety, perfectionism and agoraphobia each become a creature you learn to face, one step at a time. Lore inspired by the mood of Murakami's *Hard-Boiled Wonderland and the End of the World*.

## 2. The repository
Everything lives in this repo: design notes, references, story, and the game itself. Content (story, pages, demon lines) is kept separate from code, so the writing can change without touching the engine.

## 3. Inspiration
A Pinterest moodboard in `design/inspiration/`: inked libraries, surreal illustration, dark panels with gold frames, parchment, a misty valley at night. Notes on what each reference contributes are in `design/inspiration/NOTES.md`.

## 4. The story
`design/story/story-outline.md`: every night the Reader walks through the woods to a clock tower across the river, transcribes, and must be home before sunrise, when a huge creature roams. The demons strike on the way and in the tower. A hooded figure explains the rules. Finishing the book means understanding yourself.

## 5. Generate, refine, refine, refine
| Version | What changed |
|---|---|
| v1 | 2D book puzzle in the browser, simple 3D town behind it |
| v2 | Storybook concept art: key art, the Reader, the hooded figure, a gold UI kit |
| v3 | First 3D models of the tower, bridge and cottage; night sky; gold-framed UI |
| v4 | Realistic direction: new characters (boy and girl), demon wraith, buildings, textures |
| v5 | A large world: a winding path through a dense forest to the river; third-person walking |
| v6 | Trees grown from photo textures, wind in every leaf, a flowing river, a moon that crosses the sky |
| v7 | Night lighting: moon as key light, light through leaves, contact shading, matte cloth, finer rocks |
| v8 | Sound: wind, forest, river, footsteps, quill and pages, demon battles, an ElevenLabs score |
| v9 | Forest floor under the trees, a soft dirt path, logs, stumps and mushrooms, a real brass lantern in hand, idle and run animations |

A 30-second progress reel is in `design/reel/`.

## Tools
- **Three.js** for the 3D world, **Vite** to run it
- **Higgsfield** for concept art, 3D models (image to 3D, with rigging and animation), textures and sound effects
- **ElevenLabs Music** (through Higgsfield) for the score
