#!/usr/bin/env node
/**
 * 把產品上的 video_job edit pack 存到 ./edit/<jobId>/pack.json
 * 用法: node scripts/fetch-edit-pack.mjs <jobId> [--base http://127.0.0.1:8788] [--cookie 'gmc_session=...']
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const jobId = process.argv[2];
if (!jobId || jobId.startsWith('-')) {
  console.error('用法: node scripts/fetch-edit-pack.mjs <jobId> [--base URL] [--cookie NAME=VALUE]');
  process.exit(1);
}

const args = process.argv.slice(3);
const base = args.includes('--base') ? args[args.indexOf('--base') + 1] : 'http://127.0.0.1:8788';
const cookie = args.includes('--cookie') ? args[args.indexOf('--cookie') + 1] : process.env.GMC_COOKIE ?? '';

const res = await fetch(`${base.replace(/\/$/, '')}/api/video-jobs/${jobId}/edit-pack`, {
  headers: cookie ? { Cookie: cookie } : {},
});
if (!res.ok) {
  console.error(await res.text());
  process.exit(1);
}
const data = await res.json();
const dir = resolve('edit', jobId);
await mkdir(dir, { recursive: true });
await writeFile(resolve(dir, 'pack.json'), JSON.stringify(data.pack, null, 2));
if (data.srt) await writeFile(resolve(dir, 'master.srt'), data.srt);
if (data.edl) await writeFile(resolve(dir, 'edl.json'), JSON.stringify(data.edl, null, 2));
console.log(dir);
