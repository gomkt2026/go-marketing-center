#!/usr/bin/env python3
"""TaskGo × Washgo 宣傳版：小咪配音，沿用 Podcast 的 eleven_v3 設定。

Podcast 用 text-to-dialogue、eleven_v3、stability 0.5，不加速、不加 style。
背景音樂與音效用剪輯輸出的分軌，不另做循環片頭樂。
"""
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
ELEVEN_DIALOGUE = "https://api.elevenlabs.io/v1/text-to-dialogue?output_format=mp3_44100_128"
OUT_PUBLIC = ROOT / "public" / "briefings" / "alliance-1012" / "washgo.mp4"
POSTER = ROOT / "public" / "briefings" / "alliance-1012" / "washgo-poster.jpg"
# 對齊原旁白分軌說話時的音量，音樂和音效維持剪輯師給的相對大小
TARGET_MEAN_DB = -25.0


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
    proc = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    if proc.returncode != 0:
        sys.stderr.write(proc.stderr.decode("utf-8", "replace")[-2000:])
        raise SystemExit(f"指令失敗: {cmd[0]}")


def probe(path: Path) -> float:
    out = subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(path),
    ], text=True).strip()
    return float(out)


def mean_volume(path: Path) -> float:
    proc = subprocess.run(
        ["ffmpeg", "-i", str(path), "-af", "volumedetect", "-f", "null", "-"],
        stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True, check=True,
    )
    for line in proc.stderr.splitlines():
        if "mean_volume:" in line:
            return float(line.split("mean_volume:")[1].replace("dB", "").strip())
    return -24.0


def tts(text: str, voice_id: str, dest: Path, api_key: str) -> None:
    """跟 Podcast 一樣：eleven_v3、stability 0.5，不調速度、不加 style。"""
    dest.parent.mkdir(parents=True, exist_ok=True)
    body = json.dumps({
        "model_id": "eleven_v3",
        "inputs": [{"text": text, "voice_id": voice_id}],
        "settings": {"stability": 0.5},
    }).encode("utf-8")
    req = urllib.request.Request(
        ELEVEN_DIALOGUE,
        data=body,
        headers={
            "xi-api-key": api_key,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as res:
            dest.write_bytes(res.read())
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:180]
        raise SystemExit(f"ElevenLabs 配音失敗 ({e.code}) {dest.stem} {detail}") from None


def prepare_clip(src: Path, dest: Path, limit: float) -> float:
    """修掉多餘空白。只有超出下一句開頭時才輕輕加快，上限 1.18，避免卡頓。"""
    trimmed = dest.with_suffix(".trim.wav")
    run([
        "ffmpeg", "-y", "-i", str(src),
        "-af",
        "areverse,silenceremove=start_periods=1:start_threshold=-40dB:start_silence=0.12:detection=peak,"
        "areverse,silenceremove=start_periods=1:start_threshold=-40dB:start_silence=0.08:detection=peak,"
        "apad=pad_dur=0.06,aresample=44100,aformat=channel_layouts=stereo",
        "-c:a", "pcm_s16le", str(trimmed),
    ])
    dur = probe(trimmed)
    tempo = 1.0
    if dur > limit - 0.05:
        tempo = min(1.18, dur / max(0.6, limit - 0.08))
    filters = []
    if tempo > 1.03:
        filters.append(f"atempo={tempo:.3f}")
    paced = dest.with_suffix(".paced.wav")
    run([
        "ffmpeg", "-y", "-i", str(trimmed),
        "-af", ",".join(filters) if filters else "anull",
        "-c:a", "pcm_s16le", str(paced),
    ])
    paced_dur = probe(paced)
    gain_db = max(-8.0, min(8.0, TARGET_MEAN_DB - mean_volume(paced)))
    fade_at = max(0.05, paced_dur - 0.05)
    run([
        "ffmpeg", "-y", "-i", str(paced),
        "-af", f"volume={gain_db:.2f}dB,afade=t=in:st=0:d=0.015,afade=t=out:st={fade_at:.3f}:d=0.04",
        "-c:a", "pcm_s16le", str(dest),
    ])
    trimmed.unlink(missing_ok=True)
    paced.unlink(missing_ok=True)
    fitted = probe(dest)
    if fitted > limit + 0.05:
        print(f"  仍會碰到下一句 {dest.stem}: {fitted:.2f}s > {limit:.2f}s", file=sys.stderr)
    return fitted


def schedule(cues: list[dict], voice_dir: Path) -> list[float]:
    """上一句稍長時，下一句有空檔就往後讓，避免兩句疊在一起。"""
    durs = [probe(voice_dir / f"{cue['id']}.wav") for cue in cues]
    starts: list[float] = []
    prev_end = 0.0
    for i, cue in enumerate(cues):
        nominal = cue["startMs"] / 1000
        delayed = max(nominal, prev_end + 0.05)
        nxt = cues[i + 1]["startMs"] / 1000 if i + 1 < len(cues) else delayed + durs[i] + 0.5
        overlap_prev = max(0.0, prev_end + 0.04 - nominal)
        overflow_next = max(0.0, delayed + durs[i] - (nxt - 0.04))
        start = nominal if overflow_next > overlap_prev + 0.02 else delayed
        starts.append(start)
        prev_end = start + durs[i]
    return starts


def mix_voice(cues: list[dict], voice_dir: Path, dest: Path, total: float, starts: list[float]) -> None:
    inputs: list[str] = []
    filters: list[str] = []
    labels: list[str] = []
    for idx, cue in enumerate(cues):
        clip = voice_dir / f"{cue['id']}.wav"
        delay = int(round(max(0.0, starts[idx]) * 1000))
        inputs += ["-i", str(clip)]
        filters.append(
            f"[{idx}:a]adelay={delay}|{delay},apad=whole_dur={total:.3f}[a{idx}]"
        )
        labels.append(f"[a{idx}]")
    filters.append(
        f"{''.join(labels)}amix=inputs={len(labels)}:duration=longest:normalize=0[out]"
    )
    run([
        "ffmpeg", "-y", *inputs,
        "-filter_complex", ";".join(filters),
        "-map", "[out]", "-t", f"{total:.3f}",
        "-c:a", "pcm_s16le", str(dest),
    ])


def mux(source: Path, voice: Path, bgm: Path, sfx: Path, dest: Path, total: float, pad: float) -> None:
    """片尾停在結束卡，接上剪輯師的音樂與音效。人聲不再側鏈壓音樂。"""
    video_filter = "null" if pad < 0.05 else f"tpad=stop_mode=clone:stop_duration={pad:.3f}"
    run([
        "ffmpeg", "-y",
        "-i", str(source), "-i", str(voice), "-i", str(bgm), "-i", str(sfx),
        "-filter_complex",
        (
            f"[0:v]{video_filter},format=yuv420p[v];"
            "[1:a]aformat=channel_layouts=stereo:sample_rates=44100[vo];"
            "[2:a]aformat=channel_layouts=stereo:sample_rates=44100[bg];"
            "[3:a]aformat=channel_layouts=stereo:sample_rates=44100[fx];"
            "[vo][bg][fx]amix=inputs=3:duration=first:dropout_transition=0:normalize=0,"
            "alimiter=limit=0.97[a]"
        ),
        "-map", "[v]", "-map", "[a]",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p",
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

    pack = json.loads((PACK_DIR / "sop-pack.json").read_text(encoding="utf-8"))
    source = Path(pack["sourcePath"])
    bgm = Path(pack["bgmPath"])
    sfx = Path(pack["sfxPath"])
    for path in (source, bgm, sfx):
        if not path.exists():
            raise SystemExit(f"找不到檔案: {path}")

    voice_id = pack["voiceId"]
    cues: list[dict] = pack["cues"]
    voice_dir = PACK_DIR / "voice-xiaomi"
    voice_dir.mkdir(parents=True, exist_ok=True)
    total = max(probe(bgm), probe(sfx)) + 0.6
    video_dur = probe(source)

    for i, cue in enumerate(cues):
        raw = voice_dir / f"{cue['id']}.mp3"
        window = (cue["endMs"] - cue["startMs"]) / 1000
        if not raw.exists() or raw.stat().st_size < 800:
            print(f"tts {cue['id']} window={window:.2f}", file=sys.stderr)
            tts(cue["narration"], voice_id, raw, api_key)
        else:
            print(f"skip {cue['id']}", file=sys.stderr)
        nxt = cues[i + 1]["startMs"] / 1000 if i + 1 < len(cues) else total
        limit = max(0.8, nxt - cue["startMs"] / 1000 - 0.06)
        fitted = prepare_clip(raw, voice_dir / f"{cue['id']}.wav", limit)
        print(f"  {cue['id']} {fitted:.2f}s / 可放到 {limit:.2f}s", file=sys.stderr)

    starts = schedule(cues, voice_dir)
    last = starts[-1] + probe(voice_dir / f"{cues[-1]['id']}.wav")
    total = max(total, last + 0.25)
    pad = max(0.0, total - video_dur)
    for cue, start in zip(cues, starts):
        if abs(start - cue["startMs"] / 1000) > 0.08:
            print(f"  讓位 {cue['id']} {cue['startMs']/1000:.2f} -> {start:.2f}", file=sys.stderr)
    mix_voice(cues, voice_dir, voice_dir / "mix.wav", total, starts)
    final = PACK_DIR / "final.mp4"
    mux(source, voice_dir / "mix.wav", bgm, sfx, final, total, pad)
    subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(final), "-f", "null", "-"],
        check=True,
    )
    OUT_PUBLIC.parent.mkdir(parents=True, exist_ok=True)
    OUT_PUBLIC.write_bytes(final.read_bytes())
    print(f"ok {final} {probe(final):.2f}s pad={pad:.2f}s -> {OUT_PUBLIC}", file=sys.stderr)


if __name__ == "__main__":
    main()
