#!/usr/bin/env python3
"""Go Marketing 短影音渲染手:讀 edit pack,輸出 720p 預覽或 1080x1920 定稿。

依賴: ffmpeg, ffprobe, Python 3, Pillow, 思源黑體 TW。
不改原始素材。預覽核准前不要用 --mode final。
"""
from __future__ import annotations

import argparse
import json
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


def run(cmd: list[str]) -> None:
    print("+", " ".join(cmd), file=sys.stderr)
    subprocess.run(cmd, check=True)


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


def make_card(path: Path, title: str, subtitle: str, color: str, size: tuple[int, int], font_bold: Path, font_reg: Path) -> None:
    from PIL import Image, ImageDraw, ImageFont

    w, h = size
    img = Image.new("RGB", (w, h), "#1A1A1A")
    draw = ImageDraw.Draw(img)
    accent = color if color.startswith("#") else "#ED9121"
    draw.rectangle([0, 0, 16, h], fill=accent)
    title_font = ImageFont.truetype(str(font_bold), size=max(36, w // 16))
    sub_font = ImageFont.truetype(str(font_reg), size=max(22, w // 28))
    margin = 48
    draw.multiline_text((margin, h * 0.32), wrap(title, 12), font=title_font, fill="#FFFFFF", spacing=8)
    draw.multiline_text((margin, h * 0.62), wrap(subtitle, 16), font=sub_font, fill="#DDDDDD", spacing=6)
    img.save(path, "PNG")


def wrap(text: str, n: int) -> str:
    text = (text or "").replace("\n", "")
    return "\n".join(text[i:i + n] for i in range(0, len(text), n)) or " "


def download(url: str, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    req = urllib.request.Request(url, headers={"User-Agent": "go-marketing-renderer/1"})
    with urllib.request.urlopen(req) as res, dest.open("wb") as f:
        shutil.copyfileobj(res, f)
    return dest


def resolve_source(seg: dict, pack_dir: Path, cache: Path, source_type: str) -> tuple[Path, float, float]:
    """回傳 (path, source_start_sec, duration_sec)。"""
    duration = max(0.3, (seg["endMs"] - seg["startMs"]) / 1000)
    local = seg.get("sourcePath")
    if local and Path(local).exists():
        path = Path(local)
    else:
        key = (seg.get("sourceKey") or "").split("/")[-1]
        url = seg.get("sourceUrl")
        if url and url.startswith("/"):
            raise SystemExit(f"sourceUrl 是相對路徑,請先換成公開 URL 或本機檔:{url}")
        if not url:
            raise SystemExit(f"EDL 段 {seg.get('id')} 沒有 sourceUrl / sourcePath")
        path = download(url, cache / (key or f"{seg['id']}.bin"))

    if source_type == "upload":
        return path, seg["startMs"] / 1000, duration
    return path, 0.0, duration


def concat_audio(edl: list[dict], pack_dir: Path, work: Path, source_type: str) -> Path:
    cache = work / "src"
    parts: list[Path] = []
    for i, seg in enumerate(edl):
        src, ss, dur = resolve_source(seg, pack_dir, cache, source_type)
        fade = max(0.02, (seg.get("fadeInMs") or 30) / 1000)
        out = work / f"clip_{i:02d}.wav"
        run([
            "ffmpeg", "-y", "-ss", f"{ss:.3f}", "-t", f"{dur:.3f}", "-i", str(src),
            "-af", f"afade=t=in:st=0:d={fade},afade=t=out:st={max(0, dur - fade):.3f}:d={fade}",
            "-ar", "44100", "-ac", "2", str(out),
        ])
        parts.append(out)
    lst = work / "concat.txt"
    lst.write_text("".join(f"file '{p}'\n" for p in parts), encoding="utf-8")
    mixed = work / "audio.wav"
    run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(mixed)])
    return mixed


def write_srt(pack: dict, dest: Path) -> Path:
    srt = pack.get("srt") or ""
    dest.write_text(srt, encoding="utf-8")
    return dest


def render(pack_dir: Path, mode: str) -> Path:
    pack = load_pack(pack_dir)
    regular, bold = ensure_fonts()
    source_type = pack.get("sourceType") or "podcast_clip"
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
        audio = concat_audio(edl, pack_dir, work, source_type)
        duration = ffprobe_duration(audio)
        title_png = work / "title.png"
        end_png = work / "cta.png"
        make_card(title_png, title, "三小編熱聊 · 30 秒", color, size, bold, regular)
        make_card(end_png, cta or "聽完整集", "GO Marketing", color, size, bold, regular)
        srt = write_srt(pack, work / "master.srt")
        # 片頭 1.8s + 主畫面 + 片尾 2.5s,主畫面吃完整音訊
        body = work / "body.mp4"
        fonts_dir = str(DEFAULT_FONTS).replace("\\", "/").replace(":", "\\:")
        force_style = (
            "FontName=Source Han Sans TW,"
            f"FontSize={'22' if strategy.get('subtitleStyle') == 'large' else '18'},"
            "PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,BorderStyle=3,"
            "Outline=2,Alignment=2,MarginV=80"
        )
        run([
            "ffmpeg", "-y",
            "-loop", "1", "-t", f"{duration:.3f}", "-i", str(title_png),
            "-i", str(audio),
            "-vf", f"subtitles={srt.as_posix()}:fontsdir={fonts_dir}:force_style='{force_style}'",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest",
            str(body),
        ])
        # 片頭卡 + 正文 + 片尾卡
        head = work / "head.mp4"
        tail = work / "tail.mp4"
        run([
            "ffmpeg", "-y", "-loop", "1", "-t", "1.8", "-i", str(title_png),
            "-f", "lavfi", "-t", "1.8", "-i", "anullsrc=r=44100:cl=stereo",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(head),
        ])
        run([
            "ffmpeg", "-y", "-loop", "1", "-t", "2.5", "-i", str(end_png),
            "-f", "lavfi", "-t", "2.5", "-i", "anullsrc=r=44100:cl=stereo",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(tail),
        ])
        lst = work / "all.txt"
        lst.write_text(f"file '{head}'\nfile '{body}'\nfile '{tail}'\n", encoding="utf-8")
        run([
            "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(lst),
            "-c", "copy", str(out_path),
        ])

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
