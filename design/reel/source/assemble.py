"""Turns rendered frames + sound into the final reel mp4. Usage: python3 assemble.py <handle> <output.mp4>"""
import subprocess, sys
handle, out = sys.argv[1], sys.argv[2]
A = '/home/user/lost-wisdom/game/public/audio/'
S = 'sfx/'
# (file, start seconds, volume, optional trim length)
cues = [
    (A + 'music-title.mp3', 0.0, 0.55, 30),
    (S + 'typing.mp3', 0.5, 0.45, 4.0),
    (S + 'whoosh.mp3', 4.35, 0.55, None),
    (S + 'typing.mp3', 5.0, 0.4, 3.2),
    (S + 'whoosh.mp3', 8.95, 0.55, None),
    (S + 'whoosh.mp3', 13.75, 0.5, None),
    (A + 'page-turn.mp3', 14.0, 0.7, None),
    (S + 'typing.mp3', 14.4, 0.35, 3.6),
    (A + 'quill.mp3', 15.2, 0.35, None),
    (S + 'whoosh.mp3', 18.35, 0.55, None),
    (A + 'shimmer.mp3', 18.9, 0.5, None),
    (S + 'riser.mp3', 21.9, 0.6, None),
    (S + 'whoosh.mp3', 23.45, 0.65, None),
    (A + 'wind.mp3', 23.6, 0.7, 6.4),
    (A + 'forest-night.mp3', 23.6, 0.5, 6.4),
    (A + 'steps-grass.mp3', 23.6, 0.35, 1.6),
    (A + 'demon-appear.mp3', 26.3, 0.75, None),
    (S + 'boom.mp3', 27.65, 0.95, None),
]
inputs, filters, labels = [], [], []
inputs += ['-framerate', '30', '-i', f'out-{handle}/f_%04d.jpg']
for i, (f, start, vol, trim) in enumerate(cues, start=1):
    inputs += ['-i', f]
    tr = f'atrim=0:{trim},' if trim else ''
    fade = f'afade=t=out:st={max(0, (trim or 4) - 0.6):.2f}:d=0.6,' if trim else ''
    filters.append(f'[{i}:a]{tr}{fade}aformat=channel_layouts=stereo,volume={vol},adelay={int(start * 1000)}|{int(start * 1000)}[a{i}]')
    labels.append(f'[a{i}]')
filters.append(f'{"".join(labels)}amix=inputs={len(labels)}:normalize=0,afade=t=out:st=28.6:d=1.4,atrim=0:30,loudnorm=I=-14:TP=-1.2:LRA=11[aout]')
cmd = ['ffmpeg', '-v', 'error', '-y', *inputs, '-filter_complex', ';'.join(filters), '-map', '0:v', '-map', '[aout]',
       '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '192k',
       '-ar', '48000', '-movflags', '+faststart', '-t', '30', out]
subprocess.run(cmd, check=True)
print('wrote', out)
