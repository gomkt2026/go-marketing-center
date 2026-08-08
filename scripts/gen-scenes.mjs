// 一次性腳本:生成三張 RPG 會議室場景背景圖(與小編頭像同風格)
// 用法: node scripts/gen-scenes.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const envText = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const apiKey = envText.match(/^OPENAI_API_KEY=(.+)$/m)?.[1]?.trim();
if (!apiKey) throw new Error('OPENAI_API_KEY not found in .env');

const SCENES = [
  {
    key: 'laundry',
    prompt: 'Cute cozy 3D cartoon interior of a small Taiwanese self-service laundry shop, rows of pastel blue washing machines with round glass doors, folded colorful towels on wooden shelves, hanging clothes, warm soft lighting, kawaii toy diorama style, wide angle empty room viewed straight on like a video game stage background, no people, no text.',
  },
  {
    key: 'office',
    prompt: 'Cute cozy 3D cartoon interior of a Taiwanese property management office, wooden reception desk, wall board with many hanging house keys, small potted plants, miniature house models on shelves, pastel green tones, warm soft lighting, kawaii toy diorama style, wide angle empty room viewed straight on like a video game stage background, no people, no text.',
  },
  {
    key: 'site',
    prompt: 'Cute 3D cartoon construction site scene, unfinished brick wall, wooden scaffolding, orange traffic cones, toolboxes and paint buckets, cement bags, warm sunset pastel orange sky, kawaii toy diorama style, wide angle viewed straight on like a video game stage background, no people, no text.',
  },
];

for (const s of SCENES) {
  console.log(`生成場景 ${s.key} 中…`);
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'gpt-image-1', prompt: s.prompt, size: '1536x1024', quality: 'medium', n: 1 }),
  });
  if (!res.ok) throw new Error(`${s.key} 失敗: ${res.status} ${await res.text()}`);
  const data = await res.json();
  writeFileSync(`/tmp/scene-${s.key}.png`, Buffer.from(data.data[0].b64_json, 'base64'));
  console.log(`✓ /tmp/scene-${s.key}.png`);
}
console.log('全部完成');
