#!/usr/bin/env python3
"""把一班晨會畫成 9:16 直式影片：同一間會議室，有人接話，有人把工作拿走。"""

from __future__ import annotations

import argparse
import json
import math
import struct
import subprocess
import tempfile
import wave
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
W, H = 1080, 1920
NAVY = (11, 45, 92)
NAVY_DEEP = (7, 28, 58)
CYAN = (43, 163, 214)
WHITE = (255, 255, 255)
INK = (11, 45, 92)

FACES = {
    '阿豪': ROOT / 'public/brands/taskgo-ahao.png',
    '小咪': ROOT / 'public/brands/homigo-xiaomi.png',
    '阿樂': ROOT / 'public/brands/washgo-ale.png',
    '新聞收集': ROOT / 'public/office/cast-news.jpg',
    '行銷小編': ROOT / 'public/office/cast-strategy.jpg',
    '發文小編': ROOT / 'public/office/cast-publisher.jpg',
    'Podcast小編': ROOT / 'public/office/cast-podcast.jpg',
    '圖片小編': ROOT / 'public/office/cast-art.jpg',
    '影片小編': ROOT / 'public/office/cast-video.jpg',
}
RINGS = {
    '阿豪': (237, 145, 33),
    '小咪': (217, 199, 166),
    '阿樂': (126, 182, 224),
    '新聞收集': (183, 221, 212),
    '行銷小編': (242, 193, 78),
    '發文小編': (126, 224, 255),
    'Podcast小編': (240, 180, 41),
    '圖片小編': (244, 166, 196),
    '影片小編': (185, 166, 255),
}
BRANDS = {'taskgo': 'TaskGo', 'homigo': 'Homigo', 'washgo': 'Washgo'}
CAST = ['阿豪', '小咪', '阿樂', '新聞收集', '行銷小編', '發文小編', 'Podcast小編', '圖片小編', '影片小編']
BRAND_FACE = {'taskgo': '阿豪', 'homigo': '小咪', 'washgo': '阿樂'}


def find_font() -> Path:
    preferred = [
        ROOT / 'podcast-assets/fonts/SourceHanSansTW-Bold.otf',
        ROOT / 'podcast-assets/fonts/SourceHanSansTW-Regular.otf',
        Path('/System/Library/Fonts/PingFang.ttc'),
        Path('/System/Library/Fonts/STHeiti Medium.ttc'),
    ]
    for path in preferred:
        if path.exists():
            return path
    roots = [Path('/usr/share/fonts'), Path('/usr/share/fonts/opentype')]
    for folder in roots:
        if not folder.exists():
            continue
        for path in folder.rglob('*'):
            if path.suffix.lower() in {'.otf', '.ttc', '.ttf'} and 'NotoSansCJK' in path.name:
                return path
    raise SystemExit('找不到中文字型')


def load_font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(path), size=size, index=0)


def wrap(text: str, font: ImageFont.FreeTypeFont, width: int, limit: int) -> list[str]:
    text = ' '.join(text.replace('\n', ' ').split())
    lines: list[str] = []
    current = ''
    for char in text:
        trial = current + char
        if font.getlength(trial) <= width or char in '。，、！？':
            current = trial
            continue
        if current:
            lines.append(current)
        current = char
        if len(lines) >= limit:
            break
    if len(lines) >= limit:
        last = lines[-1]
        while last and font.getlength(last + '…') > width:
            last = last[:-1]
        lines[-1] = last + '…'
        return lines
    if current:
        lines.append(current)
    return lines or ['']


def background() -> Image.Image:
    image = Image.new('RGB', (W, H), NAVY_DEEP)
    draw = ImageDraw.Draw(image)
    draw.polygon([(0, 0), (W, 0), (W, 280), (0, 620)], fill=NAVY)
    draw.polygon([(0, 1500), (W, 1280), (W, H), (0, H)], fill=(9, 58, 110))
    draw.polygon([(0, 0), (420, 0), (0, 520)], fill=CYAN)
    return image


def paste_face(canvas: Image.Image, who: str, center: tuple[int, int], size: int) -> None:
    ring = RINGS.get(who, CYAN)
    draw = ImageDraw.Draw(canvas)
    x, y = center
    draw.ellipse((x - size // 2 - 16, y - size // 2 - 16, x + size // 2 + 16, y + size // 2 + 16), fill=ring)
    path = FACES.get(who)
    face = Image.new('RGBA', (size, size), (255, 255, 255, 255))
    if path and path.exists():
        photo = Image.open(path).convert('RGB')
        fitted = ImageOps.fit(photo, (size, size), Image.Resampling.LANCZOS, centering=(0.5, 0.18))
        face.paste(fitted, (0, 0))
    else:
        glyph = ImageDraw.Draw(face)
        glyph.ellipse((0, 0, size - 1, size - 1), fill=(232, 244, 248, 255))
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
    face.putalpha(mask)
    canvas.paste(face, (x - size // 2, y - size // 2), face)


def draw_center(draw: ImageDraw.ImageDraw, text: str, y: int, font: ImageFont.FreeTypeFont, fill: tuple[int, int, int]) -> None:
    width = font.getlength(text)
    draw.text(((W - width) / 2, y), text, font=font, fill=fill)


def face_chip(who: str, size: int, dim: bool) -> Image.Image:
    chip = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    ring = RINGS.get(who, CYAN)
    plate = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(plate).ellipse((0, 0, size - 1, size - 1), fill=(*ring, 255))
    photo = Image.new('RGBA', (size - 10, size - 10), (232, 244, 248, 255))
    path = FACES.get(who)
    if path and path.exists():
        fitted = ImageOps.fit(Image.open(path).convert('RGB'), (size - 10, size - 10), Image.Resampling.LANCZOS, centering=(0.5, 0.18))
        photo.paste(fitted, (0, 0))
    mask = Image.new('L', photo.size, 0)
    ImageDraw.Draw(mask).ellipse((0, 0, photo.size[0] - 1, photo.size[1] - 1), fill=255)
    photo.putalpha(mask)
    plate.paste(photo, (5, 5), photo)
    if dim:
        shade = Image.new('RGBA', plate.size, (7, 28, 58, 150))
        plate = Image.alpha_composite(plate, shade)
    chip.paste(plate, (0, 0), plate)
    return chip


def paint_dock(canvas: Image.Image, speaker: str, top: int, size: int) -> None:
    gap = 14
    total = len(CAST) * size + (len(CAST) - 1) * gap
    x = (W - total) // 2
    for name in CAST:
        chip = face_chip(name, size, name != speaker)
        canvas.paste(chip, (x, top), chip)
        x += size + gap


def scene_open(font_path: Path, label: str, hook: str) -> Image.Image:
    image = background()
    draw = ImageDraw.Draw(image)
    small = load_font(font_path, 40)
    hook_font = load_font(font_path, 68)
    draw_center(draw, f'晨會  {label}', 150, small, CYAN)
    size = 210
    gap = 36
    origin_x = (W - (size * 3 + gap * 2)) // 2
    origin_y = 280
    for index, name in enumerate(CAST):
        chip = face_chip(name, size, False)
        col, row = index % 3, index // 3
        image.paste(chip, (origin_x + col * (size + gap), origin_y + row * (size + gap)), chip)
    lines = wrap(hook, hook_font, 860, 2)
    y = 1180
    for line in lines:
        width = hook_font.getlength(line)
        draw.text(((W - width) / 2, y), line, font=hook_font, fill=WHITE)
        y += 96
    draw_center(draw, '九個人，沒有主持人', 1560, small, CYAN)
    return image


def scene_line(font_path: Path, who: str, text: str, label: str, reply: str) -> Image.Image:
    image = background()
    small = load_font(font_path, 36)
    name_font = load_font(font_path, 64)
    body = load_font(font_path, 48)
    reply_font = load_font(font_path, 34)
    draw = ImageDraw.Draw(image)
    draw_center(draw, label, 70, small, CYAN)
    paint_dock(image, who, 140, 86)
    paste_face(image, who, (W // 2, 620), 360)
    draw = ImageDraw.Draw(image)
    draw_center(draw, who, 830, name_font, WHITE)
    if reply:
        draw_center(draw, f'接過{reply}', 910, reply_font, CYAN)
    lines = wrap(text, body, 820, 3)
    bubble_top = 1000 if reply else 960
    bubble_h = 70 + len(lines) * 74
    draw.rounded_rectangle((80, bubble_top, W - 80, bubble_top + bubble_h), radius=32, fill=WHITE)
    draw.polygon([(W // 2 - 18, bubble_top), (W // 2 + 18, bubble_top), (W // 2, bubble_top - 22)], fill=WHITE)
    for index, line in enumerate(lines):
        width = body.getlength(line)
        draw.text(((W - width) / 2, bubble_top + 32 + index * 74), line, font=body, fill=INK)
    draw_center(draw, 'Go 行銷辦公室', 1780, small, CYAN)
    return image


def scene_end(font_path: Path, themes: list[dict], label: str, close: str) -> Image.Image:
    image = background()
    draw = ImageDraw.Draw(image)
    small = load_font(font_path, 40)
    title = load_font(font_path, 64)
    body = load_font(font_path, 40)
    draw_center(draw, label, 120, small, CYAN)
    lines = wrap(close or '人不在，這班也開完了', title, 880, 2)
    y = 220
    for line in lines:
        width = title.getlength(line)
        draw.text(((W - width) / 2, y), line, font=title, fill=WHITE)
        y += 88
    seats = themes[:3] or [
        {'slug': 'taskgo', 'theme': ''},
        {'slug': 'homigo', 'theme': ''},
        {'slug': 'washgo', 'theme': ''},
    ]
    x = 120
    for theme in seats:
        slug = str(theme.get('slug') or '')
        who = BRAND_FACE.get(slug, '')
        if who:
            chip = face_chip(who, 220, False)
            image.paste(chip, (x + 20, 560), chip)
        draw = ImageDraw.Draw(image)
        brand = BRANDS.get(slug, slug)
        brand_w = body.getlength(brand)
        draw.text((x + 130 - brand_w / 2, 810), brand, font=body, fill=CYAN)
        said_font = load_font(font_path, 34)
        said = wrap(str(theme.get('theme') or ''), said_font, 280, 2)
        text_y = 880
        for line in said:
            line_w = said_font.getlength(line)
            draw.text((x + 130 - line_w / 2, text_y), line, font=said_font, fill=WHITE)
            text_y += 48
        x += 300
    draw_center(draw, '這一班自己做完', 1680, small, CYAN)
    return image


def write_bed(path: Path, duration: float, starts: list[float]) -> None:
    """原創底樂：慢速四個和弦來回，另在每句開頭加一聲輕點。不是任何現成曲子。"""
    rate = 44100
    total = int(duration * rate)
    left = [0.0] * total
    right = [0.0] * total
    beat = 60 / 76
    chords = (
        (146.83, 220.00, 369.99),
        (196.00, 293.66, 392.00),
        (123.47, 185.00, 293.66),
        (110.00, 164.81, 277.18),
    )
    chord_len = beat * 4
    for index in range(total):
        t = index / rate
        local = (t % chord_len) / chord_len
        env = min(1.0, local / 0.12) * (0.82 + 0.18 * math.sin(2 * math.pi * local))
        tones = chords[int(t / chord_len) % 4]
        pans = (-0.35, 0.0, 0.4)
        for freq, pan in zip(tones, pans):
            tone = 0.055 * env * math.sin(2 * math.pi * freq * t)
            left[index] += tone * (0.65 - pan * 0.5)
            right[index] += tone * (0.65 + pan * 0.5)
        beat_pos = t % beat
        if beat_pos < 0.05:
            thump = 0.07 * (1 - beat_pos / 0.05) * math.sin(2 * math.pi * 78 * t)
            left[index] += thump
            right[index] += thump
    for start in starts:
        begin = int(start * rate)
        length = int(0.09 * rate)
        for i in range(length):
            pos = begin + i
            if pos >= total:
                break
            env = 1 - (i / length)
            tick = 0.05 * env * math.sin(2 * math.pi * 660 * (i / rate))
            left[pos] += tick
            right[pos] += tick * 0.7
    frames = bytearray()
    for l_sample, r_sample in zip(left, right):
        frames += struct.pack('<hh', max(-32767, min(32767, int(l_sample * 32767))), max(-32767, min(32767, int(r_sample * 32767))))
    with wave.open(str(path), 'w') as handle:
        handle.setnchannels(2)
        handle.setsampwidth(2)
        handle.setframerate(rate)
        handle.writeframes(frames)


def light_sweep(path: Path) -> None:
    image = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.polygon([(40, 0), (250, 0), (520, H), (300, H)], fill=(43, 163, 214, 56))
    image.save(path)


def render(script: dict, out: Path) -> None:
    font_path = find_font()
    label = str(script.get('label') or '').strip() or '晨會'
    hook = str(script.get('hook') or '').strip() or '沒有人主持，這班自己開了'
    close = str(script.get('close') or '').strip() or '人不在，這班也開完了'
    lines = script.get('lines') or []
    themes = script.get('themes') or []
    scenes: list[tuple[Image.Image, float]] = [(scene_open(font_path, label, hook), 3.2)]
    for line in lines:
        who = str(line.get('who') or '').strip()
        text = str(line.get('text') or '').strip()
        reply = str(line.get('reply') or '').strip()
        if not who or not text:
            continue
        seconds = max(3.4, min(5.4, 2.2 + len(text) / 12))
        scenes.append((scene_line(font_path, who, text, label, reply), seconds))
    scenes.append((scene_end(font_path, themes, label, close), 4.6))
    if len(scenes) < 2:
        raise SystemExit('這一班沒有可以畫的句子')

    out.parent.mkdir(parents=True, exist_ok=True)
    fade = 0.28
    with tempfile.TemporaryDirectory(prefix='office-meeting-') as folder:
        work = Path(folder)
        durations: list[float] = []
        starts: list[float] = []
        clock = 0.0
        clips: list[Path] = []
        for index, (image, seconds) in enumerate(scenes):
            starts.append(max(0.0, clock - fade))
            clock += seconds - (fade if index else 0)
            durations.append(seconds)
            png = work / f'{index:02d}.png'
            clip = work / f'{index:02d}.mp4'
            image.save(png)
            frames = max(12, int(round(seconds * 30)))
            subprocess.run([
                'ffmpeg', '-y', '-i', str(png),
                '-vf', (
                    f"zoompan=z='min(1+0.0009*on,1.065)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
                    f":d={frames}:s={W}x{H}:fps=30,setsar=1,format=yuv420p"
                ),
                '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
                str(clip),
            ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            clips.append(clip)
        sweep = work / 'sweep.png'
        light_sweep(sweep)
        transitions = ('fade', 'smoothleft', 'fade', 'smoothright')
        graph: list[str] = []
        prev = '[0:v]'
        acc = durations[0]
        for index in range(1, len(clips)):
            offset = acc - fade * index
            name = f'[x{index}]' if index < len(clips) - 1 else '[xf]'
            graph.append(
                f'{prev}[{index}:v]xfade=transition={transitions[index % 4]}:duration={fade:.2f}:offset={offset:.3f}{name}'
            )
            prev = name
            acc += durations[index]
        graph.append(f'[{len(clips)}:v]format=rgba[sw];[xf][sw]overlay=x=-640+mod(t*150\\,1900):y=0:format=auto:shortest=1[v]')
        video = work / 'video.mp4'
        subprocess.run([
            'ffmpeg', '-y',
            *sum((['-i', str(clip)] for clip in clips), []),
            '-loop', '1', '-i', str(sweep),
            '-filter_complex', ';'.join(graph),
            '-map', '[v]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22',
            '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(video),
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        bed = work / 'bed.wav'
        write_bed(bed, max(0.5, acc - fade * (len(clips) - 1)), starts)
        subprocess.run([
            'ffmpeg', '-y', '-i', str(video), '-i', str(bed),
            '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-shortest',
            '-movflags', '+faststart', str(out),
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--script', required=True)
    parser.add_argument('--out', required=True)
    args = parser.parse_args()
    script = json.loads(Path(args.script).read_text(encoding='utf-8'))
    render(script, Path(args.out))


if __name__ == '__main__':
    main()
