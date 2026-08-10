// 匯出 Podcast 完整 mp3(給 SoundOn 等平台上傳用)
//
// 用法:
//   node scripts/export-podcast.mjs           # 匯出最新一集(優先 approved,其次 ready_for_review)
//   node scripts/export-podcast.mjs <集數ID>  # 匯出指定集數
//   node scripts/export-podcast.mjs --no-bgm  # 不要聊天襯底音樂(片頭音樂仍保留)
//
// 需求:本機安裝 ffmpeg;.env 內有 ADMIN_USERNAME / ADMIN_PASSWORD
// 成品:podcast-assets/EP{序號}-{標題}.mp3(44.1kHz / 128kbps / 響度 -16 LUFS)

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE_URL = process.env.PODCAST_BASE_URL ?? 'https://go-marketing-center.pages.dev';
const BGM_VOLUME = 0.07;       // 襯底音樂音量
const INTRO_FADE_SEC = 2.5;    // 片頭音樂結尾淡出秒數

function loadEnvFile() {
  try {
    for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch { /* .env 不存在就靠環境變數 */ }
}

async function apiLogin() {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD }),
  });
  if (!res.ok) throw new Error(`登入失敗(${res.status}),請確認 .env 的 ADMIN_USERNAME / ADMIN_PASSWORD`);
  const cookie = res.headers.get('set-cookie')?.split(';')[0];
  if (!cookie) throw new Error('登入回應沒有 cookie');
  return cookie;
}

async function apiGet(path, cookie) {
  const res = await fetch(`${BASE_URL}${path}`, { headers: { Cookie: cookie } });
  if (!res.ok) throw new Error(`GET ${path} 失敗(${res.status})`);
  return res.json();
}

async function download(url, dest) {
  const res = await fetch(url.startsWith('http') ? url : `${BASE_URL}${url}`);
  if (!res.ok) throw new Error(`下載 ${url} 失敗(${res.status})`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

function ffprobeDuration(file) {
  const out = execFileSync('ffprobe', ['-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  return parseFloat(out.toString().trim());
}

async function main() {
  loadEnvFile();
  const args = process.argv.slice(2);
  const noBgm = args.includes('--no-bgm');
  const episodeArg = args.find((a) => !a.startsWith('--'));

  const cookie = await apiLogin();

  // 選集數
  let episodeId = episodeArg;
  if (!episodeId) {
    const { episodes } = await apiGet('/api/podcast', cookie);
    const pick = episodes.find((e) => e.status === 'approved') ?? episodes.find((e) => e.status === 'ready_for_review');
    if (!pick) throw new Error('找不到已核准或待審核的集數');
    episodeId = pick.id;
  }

  const { episode, segments } = await apiGet(`/api/podcast/${episodeId}`, cookie);
  const ready = segments.filter((s) => s.audioUrl).sort((a, b) => a.segmentOrder - b.segmentOrder);
  if (!ready.length) throw new Error('這集還沒有任何音檔,請先在後台合成語音');
  if (ready.length < segments.length) {
    console.warn(`⚠ 只有 ${ready.length}/${segments.length} 段有音檔,成品會缺段落`);
  }
  const { url: themeUrl } = await apiGet('/api/podcast/theme', cookie);

  console.log(`集數:${episode.title}(${ready.length} 段${themeUrl ? ' + 片頭音樂' : ''}${noBgm ? ',無襯底' : ''})`);

  // 下載所有音檔
  const tmp = mkdtempSync(join(tmpdir(), 'podcast-'));
  const segFiles = [];
  for (let i = 0; i < ready.length; i++) {
    const f = join(tmp, `seg-${String(i).padStart(2, '0')}.mp3`);
    await download(ready[i].audioUrl, f);
    segFiles.push(f);
  }
  let themeFile = null;
  if (themeUrl) {
    themeFile = join(tmp, 'theme.mp3');
    await download(themeUrl, themeFile);
  }

  // 1) 人聲:ElevenLabs 各段編碼一致,用 concat demuxer 重編碼合併
  const listFile = join(tmp, 'list.txt');
  writeFileSync(listFile, segFiles.map((f) => `file '${f}'`).join('\n'));
  const voiceFile = join(tmp, 'voice.mp3');
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', listFile,
    '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '128k', voiceFile]);
  const voiceDur = ffprobeDuration(voiceFile);

  // 2) 組合:片頭(淡出)→ 人聲(可選:小聲循環襯底)→ 響度標準化 -16 LUFS
  const outDir = new URL('../podcast-assets/', import.meta.url).pathname;
  mkdirSync(outDir, { recursive: true });
  const safeTitle = (episode.title ?? 'episode').replace(/[\\/:*?"<>|]/g, '').slice(0, 40);
  const outFile = join(outDir, `EP${episode.episodeSeq}-${safeTitle}.mp3`);

  // concat/amix 要求各輸入的取樣率與聲道一致,先統一成 44.1kHz 立體聲
  const FMT = 'aformat=sample_rates=44100:channel_layouts=stereo';
  const inputs = [];
  const filters = [`[0:a]${FMT}[voice]`];
  let voiceLabel = '[voice]';
  inputs.push('-i', voiceFile);

  if (themeFile && !noBgm) {
    inputs.push('-stream_loop', '-1', '-i', themeFile);
    filters.push(
      `[1:a]${FMT},volume=${BGM_VOLUME},atrim=0:${voiceDur.toFixed(2)},afade=t=out:st=${(voiceDur - 3).toFixed(2)}:d=3[bgm]`,
      `${voiceLabel}[bgm]amix=inputs=2:duration=first:normalize=0[voicemix]`,
    );
    voiceLabel = '[voicemix]';
  }

  if (themeFile) {
    const themeDur = ffprobeDuration(themeFile);
    const introIdx = themeFile && !noBgm ? 2 : 1;
    inputs.push('-i', themeFile);
    filters.push(
      `[${introIdx}:a]${FMT},afade=t=out:st=${Math.max(0, themeDur - INTRO_FADE_SEC).toFixed(2)}:d=${INTRO_FADE_SEC}[intro]`,
      `[intro]${voiceLabel}concat=n=2:v=0:a=1[joined]`,
    );
    voiceLabel = '[joined]';
  }

  filters.push(`${voiceLabel}loudnorm=I=-16:TP=-1.5:LRA=11[out]`);

  execFileSync('ffmpeg', ['-y', '-v', 'error', ...inputs,
    '-filter_complex', filters.join(';'), '-map', '[out]',
    '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '128k',
    '-metadata', `title=${episode.title ?? ''}`, '-metadata', 'album=三小編熱聊',
    outFile]);

  rmSync(tmp, { recursive: true, force: true });
  const finalDur = ffprobeDuration(outFile);
  const min = Math.floor(finalDur / 60);
  const sec = Math.round(finalDur % 60);
  console.log(`✅ 完成:${outFile}`);
  console.log(`   長度 ${min} 分 ${sec} 秒,44.1kHz / 128kbps / -16 LUFS,可直接上傳 SoundOn`);
}

main().catch((e) => { console.error(`❌ ${e.message}`); process.exit(1); });
