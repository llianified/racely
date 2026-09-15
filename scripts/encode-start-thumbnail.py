from pathlib import Path
import subprocess
import imageio_ffmpeg
from PIL import Image, ImageChops

frames = sorted(Path('/tmp/agent-browser').glob('racely-frame-*.png'))
assert len(frames) == 80, f'Expected 80 frames, found {len(frames)}'
first = Image.open(frames[0]).convert('RGB')
second = Image.open(frames[1]).convert('RGB')
assert ImageChops.difference(first.crop((0, 0, 800, 125)), second.crop((0, 0, 800, 125))).getbbox() is None, 'Text changed between frames'
subprocess.run([
    imageio_ffmpeg.get_ffmpeg_exe(), '-y', '-v', 'warning',
    '-framerate', '20', '-i', '/tmp/agent-browser/racely-frame-%03d.png',
    '-filter_complex', '[0:v]split[a][b];[a]palettegen=max_colors=256:reserve_transparent=0[p];[b][p]paletteuse=dither=bayer:bayer_scale=3',
    '-loop', '0', '/tmp/racely-start.gif',
], check=True)
gif = Image.open('/tmp/racely-start.gif')
duration = 0
for i in range(gif.n_frames):
    gif.seek(i)
    duration += gif.info.get('duration', 0)
print({'dimensions': gif.size, 'frames': gif.n_frames, 'duration_ms': duration, 'bytes': Path('/tmp/racely-start.gif').stat().st_size, 'loop': gif.info.get('loop')})
assert gif.n_frames == 80 and duration == 4000 and gif.size == (800, 450)
assert Path('/tmp/racely-start.gif').stat().st_size < 5_000_000
for i in [0, 20, 40, 60]:
    gif.seek(i)
    gif.convert('RGB').save(f'/tmp/agent-browser/racely-gif-check-{i}.png')
