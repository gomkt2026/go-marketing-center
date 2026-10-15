#!/usr/bin/env python3
"""TaskGo × Washgo 宣傳版：依字幕時間軸配音，襯 Podcast 片頭樂，不重燒字幕。"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PACK_DIR = Path(__file__).resolve().parent
THEME = ROOT / "podcast-assets" / "theme-intro.mp3"
ELEVEN_TTS = "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
OUT_PUBLIC = ROOT / "public" / "briefings" / "alliance-1012" / "washgo.mp4"
POSTER = ROOT / "public" / "briefings" / "alliance-1012" / "washgo-poster.jpg"


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip("'").strip('"')
        if key and key not in os.environ:
            os.environ[key] = value


def run(cmd: list[str]) -> None:
    subprocess.run(cmd, check=True)


def probe(path: Path) -> float:
    out = subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(path),
    ], text=True).strip()
    return float(out)


def spoken_units(text: str) -> float:
    units = 0.0
    for ch in text:
        if ch.isspace() or ch in "，。、；！：「」—-":
            units += 0.2
        elif ch.isascii() and (ch.isalpha() or ch.isdigit()):
            units += 0.45
        else:
            units += 1.0
    return units


def tts(text: str, voice_id: str, dest: Path, api_key: str, speed: float) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)

    def request(settings: dict) -> bytes:
        body = json.dumps({
            "text": text,
            "model_id": "eleven_multilingual_v2",
            "voice_settings": settings,
        }).encode("utf-8")
        req = urllib.request.Request(
            ELEVEN_TTS.format(voice_id=voice_id),
            data=body,
            headers={
                "xi-api-key": api_key,
                "Content-Type": "application/json",
                "Accept": "audio/mpeg",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=90) as res:
            return res.read()

    settings = {
        "stability": 0.48,
        "similarity_boost": 0.78,
        "style": 0.32,
        "use_speaker_boost": True,
        "speed": round(speed, 2),
    }
    try:
        dest.write_bytes(request(settings))
    except urllib.error.HTTPError:
        settings.pop("speed", None)
        try:
            dest.write_bytes(request(settings))
        except urllib.error.HTTPError as e:
            raise SystemExit(f"ElevenLabs TTS 失敗 ({e.code}) {dest.stem}") from None


def fit_clip(src: Path, dest: Path, window: float) -> float:
    """去掉句尾空白，再把配音收進字幕視窗。加快上限 1.5 倍。"""
    trimmed = dest.with_suffix(".trim.wav")
    run([
        "ffmpeg", "-y", "-i", str(src),
        "-af",
        "areverse,silenceremove=start_periods=1:start_threshold=-42dB:start_silence=0.03,"
        "areverse,silenceremove=start_periods=1:start_threshold=-42dB:start_silence=0.02,"
        "apad=pad_dur=0.05,aresample=44100,aformat=channel_layouts=stereo",
        "-c:a", "pcm_s16le", str(trimmed),
    ])
    dur = probe(trimmed)
    tempo = 1.0
    if dur > window - 0.06:
        tempo = min(1.5, dur / max(0.45, window - 0.08))
    filters = []
    if tempo > 1.03:
        filters.append(f"atempo={tempo:.3f}")
    filters.append("loudnorm=I=-16:TP=-1.8:LRA=8")
    run([
        "ffmpeg", "-y", "-i", str(trimmed),
        "-af", ",".join(filters),
        "-c:a", "pcm_s16le", str(dest),
    ])
    trimmed.unlink(missing_ok=True)
    fitted = probe(dest)
    if fitted > window + 0.04:
        print(f"  仍長於視窗 {dest.stem}: {fitted:.2f}s > {window:.2f}s tempo={tempo:.2f}", file=sys.stderr)
    return fitted


def mix_voice(cues: list[dict], voice_dir: Path, dest: Path, total: float) -> None:
    inputs: list[str] = []
    filters: list[str] = []
    labels: list[str] = []
    for idx, cue in enumerate(cues):
        clip = voice_dir / f"{cue['id']}.wav"
        start = max(0.0, cue["startMs"] / 1000)
        delay = int(round(start * 1000))
        inputs += ["-i", str(clip)]
        filters.append(
            f"[{idx}:a]adelay={delay}|{delay},apad=whole_dur={total:.3f}[a{idx}]"
        )
        labels.append(f"[a{idx}]")
    filters.append(
        f"{''.join(labels)}amix=inputs={len(labels)}:duration=longest:normalize=0,"
        f"alimiter=limit=0.95:level=false[out]"
    )
    run([
        "ffmpeg", "-y", *inputs,
        "-filter_complex", ";".join(filters),
        "-map", "[out]", "-t", f"{total:.3f}",
        "-c:a", "pcm_s16le", str(dest),
    ])


def build_bed(dest: Path, total: float) -> None:
    """片頭樂去掉頭尾淡化，交叉淡化循環到片長。"""
    work = dest.parent
    body = work / "bed-body.wav"
    run([
        "ffmpeg", "-y", "-ss", "1.0", "-t", "14.6", "-i", str(THEME),
        "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le", str(body),
    ])
    current = body
    guard = 0
    while probe(current) < total + 1.5 and guard < 12:
        nxt = work / f"bed-loop-{guard}.wav"
        run([
            "ffmpeg", "-y", "-i", str(current), "-i", str(body),
            "-filter_complex", "acrossfade=d=1.15:c1=tri:c2=tri",
            "-c:a", "pcm_s16le", str(nxt),
        ])
        if current != body:
            current.unlink(missing_ok=True)
        current = nxt
        guard += 1
    fade_out = max(0.0, total - 2.6)
    run([
        "ffmpeg", "-y", "-i", str(current),
        "-af", f"afade=t=in:st=0:d=1.1,afade=t=out:st={fade_out:.3f}:d=2.6",
        "-t", f"{total:.3f}", "-c:a", "pcm_s16le", str(dest),
    ])
    if current != body:
        current.unlink(missing_ok=True)
    body.unlink(missing_ok=True)


def mux(source: Path, voice: Path, bed: Path, dest: Path, total: float) -> None:
    """人聲為主，音樂在說話時側鏈壓低。畫面直接複製，不重壓。"""
    run([
        "ffmpeg", "-y",
        "-i", str(source), "-i", str(voice), "-i", str(bed),
        "-filter_complex",
        (
            "[1:a]asplit=2[vsc][vout];"
            "[2:a]volume=0.20[bg];"
            "[bg][vsc]sidechaincompress=threshold=0.012:ratio=12:attack=8:release=320:"
            "makeup=1:level_sc=1[ducked];"
            "[vout]volume=1.35[voutn];"
            "[voutn][ducked]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,"
            "alimiter=limit=0.95[a]"
        ),
        "-map", "0:v:0", "-map", "[a]",
        "-c:v", "copy",
        "-c:a", "aac", "-ar", "44100", "-ac", "2", "-b:a", "192k",
        "-t", f"{total:.3f}",
        "-movflags", "+faststart",
        str(dest),
    ])


def main() -> None:
    load_env(ROOT / ".env")
    api_key = os.environ.get("ELEVENLABS_API_KEY")
    if not api_key:
        raise SystemExit("沒有 ELEVENLABS_API_KEY")
    if not THEME.exists():
        raise SystemExit("找不到 podcast 片頭音樂")

    pack = json.loads((PACK_DIR / "sop-pack.json").read_text(encoding="utf-8"))
    source = Path(pack["sourcePath"])
    if not source.exists():
        raise SystemExit(f"找不到來源影片: {source}")
    voices: dict[str, str] = pack["voices"]
    cues: list[dict] = pack["cues"]
    total = probe(source)
    voice_dir = PACK_DIR / "voice"
    voice_dir.mkdir(parents=True, exist_ok=True)

    for cue in cues:
        raw = voice_dir / f"{cue['id']}.mp3"
        window = (cue["endMs"] - cue["startMs"]) / 1000
        # 自然語速約每秒 4.6 個單位；先把語速拉到能放進視窗，上限 1.2
        need = (spoken_units(cue["narration"]) / 4.6) / max(0.5, window * 0.9)
        speed = max(0.98, min(1.2, need))
        if not raw.exists() or raw.stat().st_size < 800:
            print(f"tts {cue['id']} speed={speed:.2f} window={window:.2f}", file=sys.stderr)
            tts(cue["narration"], voices[cue["voice"]], raw, api_key, speed)
        else:
            print(f"skip {cue['id']}", file=sys.stderr)
        fitted = fit_clip(raw, voice_dir / f"{cue['id']}.wav", window)
        print(f"  fit {cue['id']} {fitted:.2f}s / {window:.2f}s", file=sys.stderr)

    mix_voice(cues, voice_dir, voice_dir / "mix.wav", total)
    build_bed(voice_dir / "bed.wav", total)
    final = PACK_DIR / "final.mp4"
    mux(source, voice_dir / "mix.wav", voice_dir / "bed.wav", final, total)
    subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(final), "-f", "null", "-"],
        check=True,
    )
    OUT_PUBLIC.parent.mkdir(parents=True, exist_ok=True)
    OUT_PUBLIC.write_bytes(final.read_bytes())
    run([
        "ffmpeg", "-y", "-ss", "1.6", "-i", str(source),
        "-frames:v", "1", "-q:v", "2", str(POSTER),
    ])
    print(f"ok {final} -> {OUT_PUBLIC}", file=sys.stderr)
    print(f"poster {POSTER}", file=sys.stderr)


if __name__ == "__main__":
    main()
