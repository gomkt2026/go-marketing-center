#!/usr/bin/env python3
"""Go Marketing 短影音渲染手:讀 edit pack,輸出 720p 預覽或 1080x1920 定稿。

依賴: ffmpeg, ffprobe, Python 3, Pillow, 思源黑體 TW。
不改原始素材。預覽核准前不要用 --mode final。
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_FONTS = ROOT / "podcast-assets" / "fonts"
REGULAR = DEFAULT_FONTS / "SourceHanSansTW-Regular.otf"
BOLD = DEFAULT_FONTS / "SourceHanSansTW-Bold.otf"
COVER = ROOT / "podcast-assets" / "podcast-cover-main.png"
LOCAL_AVATARS = {
    "阿豪": ROOT / "taskgo-ahao.png",
    "小咪": ROOT / "homigo-xiaomi.png",
    "阿樂": ROOT / "washgo-ale.png",
    "taskgo": ROOT / "taskgo-ahao.png",
    "homigo": ROOT / "homigo-xiaomi.png",
    "washgo": ROOT / "washgo-ale.png",
}


def run(cmd: list[str], cwd: Path | None = None) -> None:
    print("+", " ".join(cmd), file=sys.stderr)
    subprocess.run(cmd, check=True, cwd=cwd)


def ffprobe_duration(path: Path) -> float:
    out = subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(path),
    ], text=True).strip()
    return float(out)


def decode_ok(path: Path) -> None:
    subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-f", "null", "-"],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
    )


def load_pack(pack_dir: Path) -> dict:
    for name in ("pack.json", "edit-pack.json"):
        p = pack_dir / name
        if p.exists():
            return json.loads(p.read_text(encoding="utf-8"))
    raise SystemExit(f"找不到 pack.json:{pack_dir}")


def ensure_fonts() -> tuple[Path, Path]:
    if not REGULAR.exists() or not BOLD.exists():
        raise SystemExit(
            "缺少思源黑體 TW。請放到 podcast-assets/fonts/\n"
            "SourceHanSansTW-Regular.otf 與 SourceHanSansTW-Bold.otf\n"
            "https://github.com/adobe-fonts/source-han-sans/tree/release/SubsetOTF/TW"
        )
    return REGULAR, BOLD


def open_rgb(path: Path) -> "Image.Image":
    from PIL import Image
    return Image.open(path).convert("RGBA")


def cover_background(size: tuple[int, int], cover_path: Path | None) -> "Image.Image":
    from PIL import Image, ImageEnhance, ImageFilter
    w, h = size
    if cover_path and cover_path.exists():
        bg = open_rgb(cover_path)
        scale = max(w / bg.width, h / bg.height)
        bg = bg.resize((int(bg.width * scale) + 2, int(bg.height * scale) + 2), Image.Resampling.LANCZOS)
        left = (bg.width - w) // 2
        top = (bg.height - h) // 2
        bg = bg.crop((left, top, left + w, top + h))
        bg = ImageEnhance.Brightness(bg.filter(ImageFilter.GaussianBlur(12))).enhance(0.38)
        return bg.convert("RGBA")
    return Image.new("RGBA", (w, h), (20, 20, 20, 255))


def circle_portrait(src: "Image.Image", diameter: int, ring: str | None = None, dim: bool = False) -> "Image.Image":
    from PIL import Image, ImageDraw, ImageEnhance
    img = src.convert("RGBA")
    side = min(img.width, img.height)
    left = (img.width - side) // 2
    top = max(0, (img.height - side) // 5)
    img = img.crop((left, top, left + side, top + side)).resize((diameter, diameter), Image.Resampling.LANCZOS)
    if dim:
        img = ImageEnhance.Brightness(img).enhance(0.45)
        img = ImageEnhance.Color(img).enhance(0.4)
    mask = Image.new("L", (diameter, diameter), 0)
    ImageDraw.Draw(mask).ellipse((1, 1, diameter - 2, diameter - 2), fill=255)
    out = Image.new("RGBA", (diameter, diameter), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    if ring:
        draw = ImageDraw.Draw(out)
        draw.ellipse((2, 2, diameter - 3, diameter - 3), outline=ring, width=max(6, diameter // 36))
    return out


def fallback_portrait(name: str, color: str, diameter: int) -> "Image.Image":
    from PIL import Image, ImageDraw, ImageFont
    img = Image.new("RGBA", (diameter, diameter), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.ellipse((0, 0, diameter - 1, diameter - 1), fill=color or "#888888")
    font = ImageFont.truetype(str(BOLD if BOLD.exists() else REGULAR), size=diameter // 3)
    label = (name or "?")[:1]
    bbox = draw.textbbox((0, 0), label, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(((diameter - tw) / 2, (diameter - th) / 2 - bbox[1]), label, font=font, fill="#FFFFFF")
    return img


def resolve_avatar(host: dict, cache: Path) -> Path | None:
    for key in (host.get("nickname"), host.get("brandSlug")):
        local = LOCAL_AVATARS.get(key or "")
        if local and local.exists():
            return local
    url = host.get("avatarUrl")
    if url and str(url).startswith("http"):
        dest = cache / f"{host.get('brandSlug') or host.get('nickname') or 'host'}.png"
        try:
            return download(url, dest)
        except Exception:
            return None
    return None


def host_portrait(host: dict, cache: Path, diameter: int, ring: str | None = None, dim: bool = False) -> "Image.Image":
    path = resolve_avatar(host, cache)
    if path and path.exists():
        return circle_portrait(open_rgb(path), diameter, ring=ring, dim=dim)
    return fallback_portrait(host.get("nickname") or "?", host.get("color") or "#888888", diameter)


def make_card(
    path: Path,
    title: str,
    subtitle: str,
    color: str,
    size: tuple[int, int],
    font_bold: Path,
    font_reg: Path,
    hosts: list[dict] | None = None,
    cache: Path | None = None,
) -> None:
    from PIL import Image, ImageDraw, ImageFont

    w, h = size
    img = cover_background(size, COVER)
    draw = ImageDraw.Draw(img)
    accent = color if color.startswith("#") else "#ED9121"
    draw.rectangle([0, 0, 16, h], fill=accent)
    if hosts and cache is not None:
        dia = min(168, w // 5)
        gap = 18
        total = len(hosts) * dia + (len(hosts) - 1) * gap
        x = (w - total) // 2
        y = int(h * 0.22)
        for host in hosts:
            portrait = host_portrait(host, cache, dia, ring=host.get("color"))
            img.paste(portrait, (x, y), portrait)
            x += dia + gap
    title_font = ImageFont.truetype(str(font_bold), size=max(36, w // 16))
    sub_font = ImageFont.truetype(str(font_reg), size=max(22, w // 28))
    margin = 48
    draw.multiline_text((margin, h * 0.48), wrap(title, 12), font=title_font, fill="#FFFFFF", spacing=8)
    draw.multiline_text((margin, h * 0.72), wrap(subtitle, 16), font=sub_font, fill="#F0F0F0", spacing=6)
    img.convert("RGB").save(path, "PNG")


def make_line_card(
    path: Path,
    speaker: str,
    text: str,
    color: str,
    size: tuple[int, int],
    font_bold: Path,
    font_reg: Path,
    large: bool,
    hosts: list[dict],
    cache: Path,
) -> None:
    from PIL import Image, ImageDraw, ImageFont

    w, h = size
    img = cover_background(size, COVER)
    draw = ImageDraw.Draw(img)
    accent = color if color.startswith("#") else "#ED9121"
    draw.rectangle([0, 0, 16, h], fill=accent)

    current = next((x for x in hosts if x.get("nickname") == speaker or x.get("brandSlug") == speaker), None)
    others = [x for x in hosts if x is not current]
    if current is None and hosts:
        current = hosts[0]
        others = hosts[1:]

    main_d = min(420, int(w * 0.62))
    if current:
        main = host_portrait(current, cache, main_d, ring=accent)
        img.paste(main, ((w - main_d) // 2, int(h * 0.10)), main)

    small_d = min(112, w // 7)
    if others:
        total = len(others) * small_d + (len(others) - 1) * 16
        sx = (w - total) // 2
        sy = int(h * 0.10) + main_d - small_d // 3
        for host in others:
            small = host_portrait(host, cache, small_d, dim=True)
            img.paste(small, (sx, sy), small)
            sx += small_d + 16

    bar_top = h - 300
    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    od.rounded_rectangle([28, bar_top, w - 28, h - 36], radius=22, fill=(10, 10, 10, 200))
    img = Image.alpha_composite(img, overlay)
    draw = ImageDraw.Draw(img)
    name_font = ImageFont.truetype(str(font_bold), size=max(22, w // 22))
    sub_size = max(28, w // 16) if large else max(24, w // 18)
    sub_font = ImageFont.truetype(str(font_bold if large else font_reg), size=sub_size)
    draw.text((52, bar_top + 18), speaker or "三小編", font=name_font, fill=accent)
    draw.multiline_text((52, bar_top + 62), wrap(text, 12), font=sub_font, fill="#FFFFFF", spacing=10)
    img.convert("RGB").save(path, "PNG")


def wrap(text: str, n: int) -> str:
    text = (text or "").replace("\n", "")
    return "\n".join(text[i:i + n] for i in range(0, len(text), n)) or " "


def clean_len(text: str) -> int:
    return len(re.sub(r"\s+", "", text or ""))


def split_phrases(text: str) -> list[str]:
    raw = (text or "").replace("\n", "").strip()
    if not raw:
        return [" "]
    parts = [p.strip() for p in re.split(r"(?<=[！？。!?，,；;…])", raw) if p.strip()]
    out: list[str] = []
    for part in parts:
        if clean_len(part) <= 18:
            out.append(part)
        else:
            compact = re.sub(r"\s+", "", part)
            for i in range(0, len(compact), 14):
                out.append(compact[i:i + 14])
    return out or [raw]


def line_order(seg: dict) -> int | None:
    sid = str(seg.get("id") or "")
    if sid[:1] == "l" and sid[1:].isdigit():
        return int(sid[1:])
    return None


def format_srt_time(sec: float) -> str:
    ms = max(0, int(round(sec * 1000)))
    h, rem = divmod(ms, 3_600_000)
    m, rem = divmod(rem, 60_000)
    s, frac = divmod(rem, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{frac:03d}"


TITLE_SEC = 1.8
TAIL_SEC = 2.5
VIDEO_ENCODE = [
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "30",
    "-c:a", "aac", "-ar", "44100", "-ac", "2",
]


def still_clip(png: Path, audio: Path | None, dest: Path, duration: float) -> None:
    cmd = ["ffmpeg", "-y", "-loop", "1", "-t", f"{duration:.3f}", "-i", str(png)]
    if audio:
        cmd += ["-i", str(audio)]
    else:
        cmd += ["-f", "lavfi", "-t", f"{duration:.3f}", "-i", "anullsrc=r=44100:cl=stereo"]
    cmd += VIDEO_ENCODE + ["-t", f"{duration:.3f}", str(dest)]
    run(cmd)


def concat_clips(parts: list[Path], dest: Path, work: Path) -> None:
    lst = work / f"{dest.stem}.txt"
    lst.write_text("".join(f"file '{p}'\n" for p in parts), encoding="utf-8")
    run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(lst), *VIDEO_ENCODE, str(dest)])


def source_span(seg: dict, path: Path) -> tuple[float, float]:
    """回傳來源音檔的 (start_sec, duration_sec)。優先用同檔全部台詞的字數比例對齊真實長度。"""
    fallback = max(0.3, (seg["endMs"] - seg["startMs"]) / 1000)
    siblings = seg.get("chunkLines") or []
    if siblings:
        file_dur = ffprobe_duration(path)
        weights = [max(1, clean_len(x.get("text") or "")) for x in siblings]
        total = sum(weights) or 1
        order = line_order(seg)
        start_w = 0
        this_w = max(1, clean_len(seg.get("text") or ""))
        matched = False
        for item, weight in zip(siblings, weights):
            same = (
                (order is not None and item.get("order") == order)
                or item.get("text") == seg.get("text")
            )
            if same:
                this_w = weight
                matched = True
                break
            start_w += weight
        if matched:
            return file_dur * (start_w / total), max(0.3, file_dur * (this_w / total))
    return (seg.get("startMs") or 0) / 1000, fallback


def download(url: str, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    req = urllib.request.Request(url, headers={"User-Agent": "go-marketing-renderer/1"})
    with urllib.request.urlopen(req) as res, dest.open("wb") as f:
        shutil.copyfileobj(res, f)
    return dest


def resolve_source(seg: dict, pack_dir: Path, cache: Path) -> Path:
    local = seg.get("sourcePath")
    if local and Path(local).exists():
        return Path(local)
    key = (seg.get("sourceKey") or "").split("/")[-1]
    url = seg.get("sourceUrl")
    if url and url.startswith("/"):
        raise SystemExit(f"sourceUrl 是相對路徑,請先換成公開 URL 或本機檔:{url}")
    if not url:
        raise SystemExit(f"EDL 段 {seg.get('id')} 沒有 sourceUrl / sourcePath")
    return download(url, cache / (key or f"{seg['id']}.bin"))


def write_cues_srt(cues: list[tuple[float, float, str]], dest: Path) -> Path:
    blocks = []
    for i, (start, end, text) in enumerate(cues, 1):
        blocks.append(
            f"{i}\n{format_srt_time(start)} --> {format_srt_time(end)}\n{wrap(text, 14)}\n"
        )
    dest.write_text("\n".join(blocks), encoding="utf-8")
    return dest


def render(pack_dir: Path, mode: str) -> Path:
    pack = load_pack(pack_dir)
    regular, bold = ensure_fonts()
    size = (720, 1280) if mode == "preview" else (1080, 1920)
    out_name = "preview.mp4" if mode == "preview" else "final.mp4"
    out_path = pack_dir / out_name
    strategy = pack.get("strategy") or {}
    title = pack.get("title") or strategy.get("title") or "三小編熱聊"
    cta = pack.get("cta") or strategy.get("cta") or ""
    brand = strategy.get("brandSlug") or "taskgo"
    color = ((pack.get("brands") or {}).get(brand) or {}).get("color") or "#ED9121"
    edl = pack.get("edl") or []
    if not edl:
        raise SystemExit("EDL 是空的")

    with tempfile.TemporaryDirectory(prefix="go-short-") as tmp:
        work = Path(tmp)
        cache = work / "src"
        cache.mkdir(parents=True, exist_ok=True)
        hosts = pack.get("hosts") or []
        title_png = work / "title.png"
        end_png = work / "cta.png"
        make_card(title_png, title, "三小編熱聊 · 30 秒", color, size, bold, regular, hosts, cache)
        make_card(end_png, cta or "聽完整集", "GO Marketing", color, size, bold, regular, hosts, cache)
        large = strategy.get("subtitleStyle") == "large"
        brand_colors = pack.get("brands") or {}
        body_parts: list[Path] = []
        cues: list[tuple[float, float, str]] = []
        timeline = TITLE_SEC
        for i, seg in enumerate(edl):
            src = resolve_source(seg, pack_dir, cache)
            ss, dur = source_span(seg, src)
            phrases = split_phrases(seg.get("text") or "")
            total_chars = sum(clean_len(p) for p in phrases) or 1
            seg_color = (brand_colors.get(seg.get("brandSlug") or brand) or {}).get("color") or color
            fade = max(0.02, (seg.get("fadeInMs") or 30) / 1000)
            cursor = ss
            for j, phrase in enumerate(phrases):
                p_dur = max(0.35, dur * (clean_len(phrase) / total_chars))
                fade_out = min(fade, max(0.02, p_dur - 0.05))
                frame = work / f"line_{i:02d}_{j:02d}.png"
                wav = work / f"clip_{i:02d}_{j:02d}.wav"
                make_line_card(
                    frame, seg.get("speaker") or "", phrase, seg_color,
                    size, bold, regular, large, hosts, cache,
                )
                run([
                    "ffmpeg", "-y", "-ss", f"{cursor:.3f}", "-t", f"{p_dur:.3f}", "-i", str(src),
                    "-af", f"afade=t=in:st=0:d={fade},afade=t=out:st={max(0, p_dur - fade_out):.3f}:d={fade_out}",
                    "-ar", "44100", "-ac", "2", str(wav),
                ])
                clip = work / f"line_{i:02d}_{j:02d}.mp4"
                still_clip(frame, wav, clip, p_dur)
                body_parts.append(clip)
                cues.append((timeline, timeline + p_dur, phrase))
                timeline += p_dur
                cursor += p_dur
        write_cues_srt(cues, pack_dir / "master.srt")
        body = work / "body.mp4"
        concat_clips(body_parts, body, work)
        head = work / "head.mp4"
        tail = work / "tail.mp4"
        still_clip(title_png, None, head, TITLE_SEC)
        still_clip(end_png, None, tail, TAIL_SEC)
        concat_clips([head, body, tail], out_path, work)

    decode_ok(out_path)
    print(out_path)
    return out_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Render Go Marketing 30s vertical short")
    parser.add_argument("--pack", help="含 pack.json 的 edit 目錄")
    parser.add_argument("--job", help="video_job id(本機需先把 edit pack 存到 edit/<id>)")
    parser.add_argument("--mode", choices=("preview", "final"), default="preview")
    args = parser.parse_args()

    if args.mode == "final":
        print("提醒:final 只在預覽核准後使用。", file=sys.stderr)

    if args.pack:
        pack_dir = Path(args.pack)
    elif args.job:
        pack_dir = ROOT / "edit" / args.job
        if not pack_dir.exists():
            raise SystemExit(f"請先把 edit pack 放到 {pack_dir}(含 pack.json)")
    else:
        raise SystemExit("請指定 --pack 或 --job")

    pack_dir.mkdir(parents=True, exist_ok=True)
    render(pack_dir, args.mode)


if __name__ == "__main__":
    main()
