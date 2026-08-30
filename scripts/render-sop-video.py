#!/usr/bin/env python3
"""Go Marketing 操作 SOP 教學片渲染：來源畫面 + 步驟條 + 字幕 + 配音。"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_FONTS = ROOT / "podcast-assets" / "fonts"
REGULAR = DEFAULT_FONTS / "SourceHanSansTW-Regular.otf"
BOLD = DEFAULT_FONTS / "SourceHanSansTW-Bold.otf"
THEME = ROOT / "podcast-assets" / "theme-intro.mp3"
BGM_VOLUME = 0.09
BRAND_COLOR = {
    "taskgo": "#ED9121",
    "homigo": "#A7C18D",
    "washgo": "#A87C64",
}


def run(cmd: list[str]) -> None:
    print("+", " ".join(cmd), file=sys.stderr)
    subprocess.run(cmd, check=True)


def ffprobe_wh_dur(path: Path) -> tuple[int, int, float]:
    raw = subprocess.check_output([
        "ffprobe", "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height:format=duration",
        "-of", "json", str(path),
    ], text=True)
    data = json.loads(raw)
    stream = data["streams"][0]
    dur = float(data["format"]["duration"])
    return int(stream["width"]), int(stream["height"]), dur


def decode_ok(path: Path) -> None:
    subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-f", "null", "-"],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
    )


def load_pack(pack_dir: Path) -> dict:
    p = pack_dir / "sop-pack.json"
    if not p.exists():
        raise SystemExit(f"找不到 sop-pack.json:{pack_dir}")
    return json.loads(p.read_text(encoding="utf-8"))


def ensure_fonts() -> None:
    if not REGULAR.exists() or not BOLD.exists():
        raise SystemExit("缺少思源黑體 TW，請放到 podcast-assets/fonts/")


def ensure_theme() -> Path | None:
    """優先用本機片頭；沒有就從已匯出的 Podcast 集數開頭抽出開場樂。"""
    if THEME.exists() and THEME.stat().st_size > 8000:
        return THEME
    episodes = sorted((ROOT / "podcast-assets").glob("EP*.mp3"))
    if not episodes:
        print("找不到 Podcast 片頭或 EP 音檔，這次不加 BGM。", file=sys.stderr)
        return None
    THEME.parent.mkdir(parents=True, exist_ok=True)
    # 匯出成品開頭是片頭音樂，約 20 秒後進人聲；截 18 秒並頭尾淡化方便循環
    try:
        subprocess.run([
            "ffmpeg", "-y", "-i", str(episodes[0]),
            "-t", "18",
            "-af", "afade=t=in:st=0:d=0.6,afade=t=out:st=16.2:d=1.8",
            "-c:a", "libmp3lame", "-b:a", "160k",
            str(THEME),
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except subprocess.CalledProcessError:
        print("抽出片頭音樂失敗，這次不加 BGM。", file=sys.stderr)
        return None
    if THEME.exists() and THEME.stat().st_size > 8000:
        print(f"已從 {episodes[0].name} 抽出片頭音樂", file=sys.stderr)
        return THEME
    return None


def hex_rgb(color: str) -> tuple[int, int, int]:
    c = (color or "#ED9121").lstrip("#")
    return int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16)


def wrap_caption(text: str, max_chars: int) -> str:
    raw = (text or "").replace("\n", "")
    if len(raw) <= max_chars:
        return raw
    # 優先在「」或逗號後折行
    for sep in ("」，", "。", "，", " "):
        idx = raw.find(sep)
        if 6 <= idx <= max_chars:
            return raw[: idx + 1] + "\n" + raw[idx + 1 :]
    return raw[:max_chars] + "\n" + raw[max_chars:]


def make_overlay(path: Path, pack: dict, cue: dict, size: tuple[int, int]) -> Path:
    from PIL import Image, ImageDraw, ImageFont

    w, h = size
    mobile = pack.get("sourceKind") == "mobile"
    brand = pack.get("brandSlug") or "taskgo"
    accent = hex_rgb(BRAND_COLOR.get(brand, "#ED9121"))
    brand_name = {"taskgo": "TaskGo", "homigo": "Homigo", "washgo": "Washgo"}.get(brand, brand)
    title = pack.get("title") or ""
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    title_font = ImageFont.truetype(str(BOLD), size=max(22, w // 38))
    step_font = ImageFont.truetype(str(BOLD), size=max(20, w // 36))
    cap_font = ImageFont.truetype(str(BOLD if mobile else REGULAR), size=max(28, w // 24))

    # 左上品牌條
    label = f"{brand_name}  {title}"
    tb = draw.textbbox((0, 0), label, font=title_font)
    tw, th = tb[2] - tb[0], tb[3] - tb[1]
    pad_x, pad_y = 16, 8
    draw.rounded_rectangle(
        [16, 14, 16 + tw + pad_x * 2, 14 + th + pad_y * 2],
        radius=10, fill=(16, 16, 16, 210),
    )
    draw.rectangle([16, 14, 22, 14 + th + pad_y * 2], fill=accent + (255,))
    draw.text((16 + pad_x + 4, 14 + pad_y - tb[1]), label, font=title_font, fill="#FFFFFF")

    step = int(cue.get("step") or 0)
    total = int(cue.get("stepTotal") or 0)
    if step > 0 and total > 0:
        chip = f"步驟 {step}／{total}"
        sb = draw.textbbox((0, 0), chip, font=step_font)
        sw, sh = sb[2] - sb[0], sb[3] - sb[1]
        left = w - 20 - sw - pad_x * 2
        draw.rounded_rectangle(
            [left, 14, w - 16, 14 + sh + pad_y * 2],
            radius=10, fill=accent + (235,),
        )
        draw.text((left + pad_x, 14 + pad_y - sb[1]), chip, font=step_font, fill="#FFFFFF")

    sub = wrap_caption((cue.get("subtitle") or "").strip(), 16 if mobile else 18)
    if sub:
        lines = sub.split("\n")[:2]
        gap = 8
        boxes = [draw.textbbox((0, 0), line, font=cap_font) for line in lines]
        line_h = max(b[3] - b[1] for b in boxes)
        text_w = max(b[2] - b[0] for b in boxes)
        text_h = line_h * len(lines) + gap * (len(lines) - 1)
        plate_w = min(w - 40, text_w + 48)
        plate_h = text_h + 28
        if mobile:
            top = int(h * 0.62)
        else:
            top = h - plate_h - int(h * 0.08)
        left = (w - plate_w) // 2
        draw.rounded_rectangle(
            [left, top, left + plate_w, top + plate_h],
            radius=16, fill=(10, 10, 10, 200),
        )
        y = top + 14
        for line, box in zip(lines, boxes):
            lw = box[2] - box[0]
            draw.text((left + (plate_w - lw) // 2, y - box[1]), line, font=cap_font, fill="#FFFFFF")
            y += line_h + gap

    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "PNG")
    return path


def write_srt(pack: dict, dest: Path) -> None:
    lines: list[str] = []
    for i, cue in enumerate(pack.get("cues") or [], 1):
        sub = (cue.get("subtitle") or "").strip()
        if not sub:
            continue
        start = int(cue.get("startMs") or 0)
        end = int(cue.get("endMs") or start + 1000)
        lines.append(str(i))
        lines.append(f"{srt_time(start)} --> {srt_time(end)}")
        lines.append(sub)
        lines.append("")
    dest.write_text("\n".join(lines), encoding="utf-8")


def srt_time(ms: int) -> str:
    ms = max(0, int(ms))
    h, rem = divmod(ms, 3_600_000)
    m, rem = divmod(rem, 60_000)
    s, frac = divmod(rem, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{frac:03d}"


def target_size(src_w: int, src_h: int, kind: str, mode: str) -> tuple[int, int]:
    long_edge = 1280 if mode == "preview" else 1920
    if kind == "mobile":
        w = 720 if mode == "preview" else 1080
        h = int(round(src_h * (w / src_w)))
        if h % 2:
            h += 1
        return w, h
    scale = long_edge / max(src_w, src_h)
    w = int(round(src_w * scale))
    h = int(round(src_h * scale))
    if w % 2:
        w += 1
    if h % 2:
        h += 1
    return w, h


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pack", required=True)
    parser.add_argument("--mode", choices=("preview", "final"), default="preview")
    args = parser.parse_args()
    ensure_fonts()

    pack_dir = Path(args.pack).resolve()
    pack = load_pack(pack_dir)
    source = Path(pack["sourcePath"])
    if not source.exists():
        raise SystemExit(f"來源不存在:{source}")
    if args.mode == "final":
        print("注意:final 只在預覽核准後使用。", file=sys.stderr)

    src_w, src_h, dur = ffprobe_wh_dur(source)
    out_w, out_h = target_size(src_w, src_h, pack.get("sourceKind") or "desktop", args.mode)
    write_srt(pack, pack_dir / "master.srt")

    overlay_dir = pack_dir / "qa" / "overlays"
    if overlay_dir.exists():
        for old in overlay_dir.glob("*.png"):
            old.unlink()
    overlays: list[tuple[dict, Path]] = []
    for cue in pack.get("cues") or []:
        png = make_overlay(overlay_dir / f"{cue['id']}.png", pack, cue, (out_w, out_h))
        overlays.append((cue, png))

    voice = pack_dir / "voice" / "mix.wav"
    theme = ensure_theme()
    out = pack_dir / ("preview.mp4" if args.mode == "preview" else "final.mp4")
    cmd = ["ffmpeg", "-y", "-i", str(source)]
    voice_idx = None
    theme_idx = None
    next_idx = 1
    if voice.exists():
        cmd += ["-i", str(voice)]
        voice_idx = 1
        next_idx = 2
    else:
        print("沒有 voice/mix.wav，只燒字幕。", file=sys.stderr)
    if theme is not None:
        cmd += ["-stream_loop", "-1", "-i", str(theme)]
        theme_idx = next_idx
        next_idx += 1
    for _, png in overlays:
        cmd += ["-i", str(png)]

    filters = [f"[0:v]scale={out_w}:{out_h}:flags=lanczos,setsar=1[v0]"]
    last = "v0"
    for i, (cue, _) in enumerate(overlays):
        start = max(0.0, (cue.get("startMs") or 0) / 1000)
        end = max(start + 0.2, (cue.get("endMs") or 0) / 1000)
        src = next_idx + i
        dest = f"v{i + 1}"
        filters.append(
            f"[{last}][{src}:v]overlay=0:0:enable='between(t,{start:.3f},{end:.3f})'[{dest}]"
        )
        last = dest
    maps = ["-map", f"[{last}]"]
    audio_parts: list[str] = [
        "[0:a]aformat=channel_layouts=stereo:sample_rates=44100,volume=0.05[a0]"
    ]
    mix_in = ["[a0]"]
    if voice_idx is not None:
        audio_parts.append(
            f"[{voice_idx}:a]aformat=channel_layouts=stereo:sample_rates=44100[avo]"
        )
        mix_in.append("[avo]")
    if theme_idx is not None:
        fade_start = max(0.0, dur - 2.8)
        audio_parts.append(
            f"[{theme_idx}:a]aformat=channel_layouts=stereo:sample_rates=44100,"
            f"volume={BGM_VOLUME},atrim=0:{dur:.3f},"
            f"afade=t=in:st=0:d=0.8,afade=t=out:st={fade_start:.3f}:d=2.5[abgm]"
        )
        mix_in.append("[abgm]")
    if voice_idx is not None or theme_idx is not None:
        filters.append(";".join(audio_parts) + ";" +
                       f"{''.join(mix_in)}amix=inputs={len(mix_in)}:duration=first:dropout_transition=0:normalize=0[a]")
        maps += ["-map", "[a]"]
    else:
        maps += ["-an"]

    cmd += ["-filter_complex", ";".join(filters), *maps]
    cmd += [
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast",
        "-crf", "20" if args.mode == "preview" else "18",
        "-c:a", "aac", "-ar", "44100", "-ac", "2", "-b:a", "160k",
        "-movflags", "+faststart",
        str(out),
    ]
    run(cmd)
    decode_ok(out)
    print(f"ok {out} {out_w}x{out_h} {dur:.1f}s", file=sys.stderr)


if __name__ == "__main__":
    main()
