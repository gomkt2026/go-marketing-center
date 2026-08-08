// 一次性腳本:為三位品牌小編生成可愛人偶頭像
// 產出 PNG 到 /tmp,之後用 wrangler 上傳 R2、psql 更新 persona.avatarUrl
// 用法: node scripts/gen-avatars.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const envText = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const apiKey = envText.match(/^OPENAI_API_KEY=(.+)$/m)?.[1]?.trim();
if (!apiKey) throw new Error('OPENAI_API_KEY not found in .env');

const CHARACTERS = [
  {
    slug: 'taskgo',
    name: '阿豪',
    prompt: 'Cute chibi 3D mascot character figurine of a Taiwanese construction worker foreman, wearing a yellow hard hat and tool belt, big head small body, kawaii toy style, confident grin, soft studio lighting, pastel orange simple background, high quality render, centered portrait, no text.',
  },
  {
    slug: 'homigo',
    name: '小咪',
    prompt: 'Cute chibi 3D mascot character figurine of a friendly Taiwanese female property manager, holding a clipboard and house keys, big head small body, kawaii toy style, warm gentle smile, soft studio lighting, pastel green simple background, high quality render, centered portrait, no text.',
  },
  {
    slug: 'washgo',
    name: '阿樂',
    prompt: 'Cute chibi 3D mascot character figurine of a cheerful Taiwanese laundry shop clerk, holding a laundry basket with folded colorful clothes, big head small body, kawaii toy style, bright happy expression, soft studio lighting, pastel blue simple background, high quality render, centered portrait, no text.',
  },
];

for (const c of CHARACTERS) {
  console.log(`生成 ${c.name}(${c.slug})頭像中…`);
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'gpt-image-1', prompt: c.prompt, size: '1024x1024', quality: 'medium', n: 1 }),
  });
  if (!res.ok) throw new Error(`${c.slug} 失敗: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const b64 = data.data[0].b64_json;
  const out = `/tmp/avatar-${c.slug}.png`;
  writeFileSync(out, Buffer.from(b64, 'base64'));
  console.log(`✓ ${out}`);
}
console.log('全部完成');
