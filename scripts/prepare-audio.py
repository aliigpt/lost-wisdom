"""Prepares game/public/audio: seamless loops (crossfaded ends) and even loudness.
Usage: python3 scripts/prepare-audio.py   (needs ffmpeg). Originals are kept in design/audio-raw/."""
import json, os, shutil, subprocess, sys
import numpy as np

AUDIO = 'game/public/audio'
RAW = 'design/audio-raw'
LOOPS = {'wind', 'forest-night', 'river', 'battle-loop', 'heartbeat', 'steps-grass', 'steps-stone', 'steps-wood', 'music-explore'}
LOUDNESS = {'music-explore': -24, 'music-title': -24, 'wind': -26, 'forest-night': -27, 'river': -26, 'battle-loop': -23}
SR = 44100

def decode(path):
    out = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'], capture_output=True, check=True).stdout
    return np.frombuffer(out, dtype=np.float32).reshape(-1, 2).copy()

def encode(x, path, lufs):
    tmp = path + '.tmp.wav'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-i', '-', tmp], input=x.astype(np.float32).tobytes(), check=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp, '-af', f'loudnorm=I={lufs}:TP=-1.5:LRA=11', '-ar', str(SR), '-c:a', 'libmp3lame', '-b:a', '160k', path], check=True)
    os.remove(tmp)

os.makedirs(RAW, exist_ok=True)
for f in sorted(os.listdir(AUDIO)):
    if not f.endswith('.mp3'): continue
    name = f[:-4]; src = os.path.join(RAW, f)
    if not os.path.exists(src): shutil.copy(os.path.join(AUDIO, f), src)   # keep the original once
    x = decode(src)
    if name in LOOPS and len(x) > SR * 3:
        c = int(SR * min(1.5, len(x) / SR / 6))                            # crossfade length
        t = np.linspace(0, np.pi / 2, c)[:, None]
        body = x[c:].copy()
        body[-c:] = x[-c:] * np.cos(t) + x[:c] * np.sin(t)                   # equal-power crossfade into the start
        x = body
    encode(x, os.path.join(AUDIO, f), LOUDNESS.get(name, -18))
    print(f'{name}: {len(x) / SR:.1f}s', '(loop)' if name in LOOPS else '')
