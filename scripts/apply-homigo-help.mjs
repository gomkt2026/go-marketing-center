#!/usr/bin/env node
/**
 * 從 .env 讀 DATABASE_URL，套用 Homigo 客服文件 SQL。
 * 用法: node scripts/apply-homigo-help.mjs
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv(file) {
  const extra = {};
  let text = '';
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return extra;
  }
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const i = trimmed.indexOf('=');
    extra[trimmed.slice(0, i).trim()] = trimmed.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
  }
  return extra;
}

const env = { ...loadEnv(join(root, '.dev.vars')), ...loadEnv(join(root, '.env')) };
const databaseUrl = process.env.DATABASE_URL || env.DATABASE_URL;
if (!databaseUrl) {
  console.error('找不到 DATABASE_URL。請寫在專案根目錄的 .env，不要只在終端機打 $DATABASE_URL。');
  process.exit(1);
}

const sqlFile = join(root, 'db/migrations/030_homigo_help_documents.sql');
const result = spawnSync('psql', [databaseUrl, '-v', 'ON_ERROR_STOP=1', '-f', sqlFile], {
  encoding: 'utf8',
  env: process.env,
});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.status !== 0) process.exit(result.status ?? 1);
console.log('Homigo 客服文件已套用完成。');
