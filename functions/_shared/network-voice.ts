import type { Env } from './env';
import { HOMIGO_XIAOMI_VOICE_ID, synthesizeSpeech } from './elevenlabs';
import { DEFAULT_PUBLIC_BASE, buildNetworkVoiceKey, putMedia, toPublicMediaUrl } from './media';
import { transcribeWithScribe } from './scribe';
import { cleanAskField } from './network-trades';
import type { RankedContact, VendorAsk } from './network-match';

export function estimateSpeechMs(text: string): number {
  const chars = text.replace(/\s+/g, '').length;
  const ms = Math.round((chars / 4.2) * 1000);
  return Math.min(60_000, Math.max(1_200, ms));
}

export function spokenMatchScript(ask: VendorAsk, matches: RankedContact[]): string {
  const topic = [cleanAskField(ask.region), cleanAskField(ask.category)].filter(Boolean).join('')
    || cleanAskField(ask.summary)
    || '你剛說的這項';
  if (!matches.length) {
    return `嗨，我是小咪。這題我對過了，人脈庫裡暫時沒有${topic}的現成名單，我先記下來，之後有人加入再跟你說。`;
  }
  const names = matches.map((item) => {
    const c = item.contact;
    return c.company ? `${c.name}（${c.company}）` : c.name;
  }).filter(Boolean).join('、');
  return `嗨，我是小咪。${topic}我幫你對到${matches.length}位，分別是${names}。電話跟 LINE 我放在卡片上，方便你直接打。先跟對方確認檔期跟報價喔。`;
}

export async function transcribeLineAudio(
  env: Env,
  bytes: Uint8Array,
  contentType: string,
): Promise<string | null> {
  if (!env.ELEVENLABS_API_KEY) return null;
  const mime = contentType.includes('mpeg') ? 'audio/mpeg'
    : contentType.includes('wav') ? 'audio/wav'
    : 'audio/mp4';
  const ext = mime === 'audio/mpeg' ? 'mp3' : mime === 'audio/wav' ? 'wav' : 'm4a';
  const result = await transcribeWithScribe(env, {
    fileBytes: bytes,
    fileName: `line-voice.${ext}`,
    mimeType: mime,
    languageCode: 'zh',
  });
  const text = result.text.replace(/\s+/g, ' ').trim();
  return text || null;
}

export async function speakAsXiaomi(
  env: Env,
  brandSlug: string,
  text: string,
): Promise<{ url: string; durationMs: number } | null> {
  if (!env.ELEVENLABS_API_KEY || !env.MEDIA) return null;
  const spoken = text.replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();
  if (!spoken) return null;
  const payload = {
    text: spoken.slice(0, 220),
    voiceId: HOMIGO_XIAOMI_VOICE_ID,
  };
  const bytes = await synthesizeSpeech(env, { ...payload, languageCode: 'zh' }).catch(() =>
    synthesizeSpeech(env, payload),
  );
  const key = buildNetworkVoiceKey(brandSlug, 'mp3');
  const path = await putMedia(env, key, bytes, 'audio/mpeg');
  const url = toPublicMediaUrl(env, path) ?? `${DEFAULT_PUBLIC_BASE}${path}`;
  return { url, durationMs: estimateSpeechMs(spoken) };
}
