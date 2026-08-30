#!/usr/bin/env python3
"""把 sop-pack.json 的旁白合成為分段 mp3 + 對齊時間軸的 mix.wav。

從本機 .env 讀 ELEVENLABS_API_KEY，絕不把金鑰印出來。
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ELEVEN_TTS = "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"


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


def load_pack(pack_dir: Path) -> dict:
    p = pack_dir / "sop-pack.json"
    if not p.exists():
        raise SystemExit(f"找不到 sop-pack.json:{pack_dir}")
    return json.loads(p.read_text(encoding="utf-8"))


# 教學旁白稍快一點，聽起來比較像現場帶人，不要拖腔
TTS_SPEED = 1.15


def tts(text: str, voice_id: str, dest: Path, api_key: str) -> None:
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
        "stability": 0.55,
        "similarity_boost": 0.75,
        "style": 0.15,
        "use_speaker_boost": True,
        "speed": TTS_SPEED,
    }
    try:
        dest.write_bytes(request(settings))
    except urllib.error.HTTPError:
        settings.pop("speed", None)
        try:
            dest.write_bytes(request(settings))
        except urllib.error.HTTPError as e:
            raise SystemExit(f"ElevenLabs TTS 失敗 ({e.code}) cue={dest.stem}") from None


def ffprobe_duration(path: Path) -> float:
    out = subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(path),
    ], text=True).strip()
    return float(out)


def mix_timeline(cues: list[dict], voice_dir: Path, dest: Path, total_sec: float) -> None:
    """把各段 mp3 依 startMs 排到靜音床上。"""
    dest.parent.mkdir(parents=True, exist_ok=True)
    inputs: list[str] = []
    filters: list[str] = []
    labels: list[str] = []
    idx = 0
    for cue in cues:
        clip = voice_dir / f"{cue['id']}.mp3"
        if not clip.exists():
            continue
        start = max(0.0, (cue.get("startMs") or 0) / 1000)
        window = max(0.4, ((cue.get("endMs") or 0) - (cue.get("startMs") or 0)) / 1000)
        dur = ffprobe_duration(clip)
        tempo = 1.0
        if dur > window + 0.12:
            tempo = min(1.22, dur / window)
        chain = f"[{idx}:a]aresample=44100,aformat=channel_layouts=stereo"
        if abs(tempo - 1.0) > 0.02:
            chain += f",atempo={tempo:.3f}"
        delay_ms = int(round(start * 1000))
        chain += f",adelay={delay_ms}|{delay_ms},apad=whole_dur={total_sec:.3f}[a{idx}]"
        inputs += ["-i", str(clip)]
        filters.append(chain)
        labels.append(f"[a{idx}]")
        idx += 1
    if not labels:
        raise SystemExit("沒有可混音的配音檔")
    if len(labels) == 1:
        filters.append(f"{labels[0]}anull[out]")
    else:
        filters.append(f"{''.join(labels)}amix=inputs={len(labels)}:duration=longest:normalize=0[out]")
    cmd = [
        "ffmpeg", "-y", *inputs,
        "-filter_complex", ";".join(filters),
        "-map", "[out]", "-t", f"{total_sec:.3f}",
        "-c:a", "pcm_s16le", str(dest),
    ]
    subprocess.run(cmd, check=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pack", required=True, help="sop-assets/<sop-id> 目錄")
    parser.add_argument("--force", action="store_true", help="忽略已合成的 mp3，整批重跑")
    args = parser.parse_args()
    load_env(ROOT / ".env")
    api_key = os.environ.get("ELEVENLABS_API_KEY")
    if not api_key:
        raise SystemExit("沒有 ELEVENLABS_API_KEY，先出字幕預覽或把金鑰放進本機 .env")

    pack_dir = Path(args.pack).resolve()
    pack = load_pack(pack_dir)
    voice_id = pack.get("voiceId")
    if not voice_id:
        raise SystemExit("sop-pack.json 缺少 voiceId")
    cues = pack.get("cues") or []
    voice_dir = pack_dir / "voice"
    voice_dir.mkdir(parents=True, exist_ok=True)

    for cue in cues:
        text = (cue.get("narration") or "").strip()
        if not text:
            raise SystemExit(f"cue {cue.get('id')} 沒有 narration")
        dest = voice_dir / f"{cue['id']}.mp3"
        if dest.exists() and dest.stat().st_size > 800 and not args.force:
            print(f"skip {cue['id']}", file=sys.stderr)
            continue
        print(f"tts {cue['id']}", file=sys.stderr)
        tts(text, voice_id, dest, api_key)

    source = Path(pack["sourcePath"])
    total = ffprobe_duration(source)
    mix_timeline(cues, voice_dir, voice_dir / "mix.wav", total)
    print(f"ok {voice_dir / 'mix.wav'}", file=sys.stderr)


if __name__ == "__main__":
    main()
