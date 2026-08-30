#!/usr/bin/env node
/**
 * 把產品上的 video_job edit pack 存到 ./edit/<jobId>/
 *
 * 用法:
 *   node scripts/fetch-edit-pack.mjs <jobId>
 *   node scripts/fetch-edit-pack.mjs <jobId> --base https://go-marketing-center.pages.dev
 *
 * 登入優先順序:
 *   1. --cookie 'gmc_session=...'（必須是瀏覽器複製的 ASCII cookie，不能放中文說明文字）
 *   2. 環境變數 GMC_COOKIE
 *   3. .env 的 ADMIN_USERNAME / ADMIN_PASSWORD（跟 export-podcast.mjs 一樣打 /api/auth/login）
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

function argValue(flag, fallback = '') {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? (process.argv[i + 1] ?? '') : fallback;
}

function hasNonAscii(value) {
  return [...value].some((ch) => ch.charCodeAt(0) > 255);
}

async function loadEnvFile() {
  try {
    const text = await readFile(new URL('../.env', import.meta.url), 'utf8');
    for (const line of text.split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  } catch { /* 沒有 .env 就靠環境變數 */ }
}

async function login(base) {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) {
    throw new Error(
      '沒有可用的登入資訊。請擇一：\n' +
      '  • 在專案根目錄 .env 寫入 ADMIN_USERNAME / ADMIN_PASSWORD\n' +
      '  • 或從瀏覽器 DevTools → Application → Cookies 複製 gmc_session，執行：\n' +
      "    node scripts/fetch-edit-pack.mjs <jobId> --cookie 'gmc_session=實際值'",
    );
  }
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`登入失敗(${res.status}) ${text.slice(0, 200)}。請確認 .env 帳密與正式站相同。`);
  }
  const cookie = res.headers.get('set-cookie')?.split(';')[0];
  if (!cookie) throw new Error('登入成功但回應沒有 Set-Cookie');
  return cookie;
}

const jobId = process.argv[2];
if (!jobId || jobId.startsWith('-')) {
  console.error('用法: node scripts/fetch-edit-pack.mjs <jobId> [--base URL] [--cookie gmc_session=...]');
  process.exit(1);
}

await loadEnvFile();
const base = (argValue('--base', process.env.PODCAST_BASE_URL ?? 'https://go-marketing-center.pages.dev')).replace(/\/$/, '');
let cookie = argValue('--cookie', process.env.GMC_COOKIE ?? '');

if (cookie && (hasNonAscii(cookie) || /你的|登入cookie|placeholder/i.test(cookie))) {
  console.error('Cookie 不能是說明文字。請改用 .env 帳密自動登入，或貼上瀏覽器裡真正的 gmc_session。');
  process.exit(1);
}

try {
  if (!cookie) cookie = await login(base);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}

const res = await fetch(`${base}/api/video-jobs/${jobId}/edit-pack`, {
  headers: { Cookie: cookie },
});
if (!res.ok) {
  console.error(`下載 edit pack 失敗(${res.status}):`, await res.text());
  process.exit(1);
}

const data = await res.json();
if (!data.pack) {
  console.error('回應沒有 pack。請先在網頁核准策略。');
  process.exit(1);
}

const dir = resolve('edit', jobId);
await mkdir(dir, { recursive: true });
await writeFile(resolve(dir, 'pack.json'), JSON.stringify(data.pack, null, 2));
if (data.srt) await writeFile(resolve(dir, 'master.srt'), data.srt);
if (data.edl) await writeFile(resolve(dir, 'edl.json'), JSON.stringify(data.edl, null, 2));
console.log(`已寫入 ${dir}`);
console.log(`下一步: python3 scripts/render-short-video.py --pack ${dir} --mode preview`);
