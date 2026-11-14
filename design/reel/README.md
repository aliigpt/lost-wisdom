# Progress reels

`lost-wisdom-reel-aliigpt.mp4` and `lost-wisdom-reel-aliigpt.en.mp4`: 30 seconds, 1080×1920, 30 fps, ready for Instagram Reels. They differ only in the handle on the end card.

| Time | Part |
|---|---|
| 0–4.6 s | 01 · The idea (the first message) |
| 4.6–9.2 s | 02 · The GitHub repo |
| 9.2–14 s | 03 · The Pinterest moodboard |
| 14–18.6 s | 04 · Writing the story |
| 18.6–24 s | 05 · Generate, refine, refine, refine (every version) |
| 24–30 s | Real gameplay, then the title |

Sound: ElevenLabs title theme, plus typing, whooshes, quill, wind and a title boom (Higgsfield / Mirelo).

## How it was made (`source/`)
1. `capture.js` films gameplay frame by frame: the game clock is frozen and advanced exactly 1/30 s per frame, so footage is smooth however slow rendering is.
2. `reel.html` draws any moment of the reel (text, typing, moodboard, montage, gameplay frames, title).
3. `render.js` screenshots `reel.html` 900 times.
4. `assemble.py` encodes the frames and mixes the sound with ffmpeg.
