import type { Env } from './env';
import type { MeetingEmotion } from './meeting-ai';

// ElevenLabs Text-to-Dialogue(eleven_v3):多說話人對話語音合成
// 官方限制:單次請求最多 10 個 voice_id,總字數建議 <= 2000 字元
// 文件:https://elevenlabs.io/docs/api-reference/text-to-dialogue

const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1';

/** 單次 Text-to-Dialogue 請求的總字數上限(官方建議 2000,保留緩衝) */
export const DIALOGUE_CHAR_LIMIT = 1800;

export class ElevenLabsError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ElevenLabsError';
  }
}

function requireApiKey(env: Env): string {
  if (!env.ELEVENLABS_API_KEY) {
    throw new ElevenLabsError(500, 'ELEVENLABS_API_KEY 尚未設定,請先執行 wrangler pages secret put ELEVENLABS_API_KEY');
  }
  return env.ELEVENLABS_API_KEY;
}

/**
 * 情緒 → ElevenLabs v3 inline audio tag 對照表。
 * 沿用 meeting-ai.ts 的 MEETING_EMOTIONS 情緒系統;v3 的 audio tag 以英文效果最穩定。
 * neutral 不加 tag,讓模型自然依上下文判斷。
 */
const EMOTION_AUDIO_TAG: Record<MeetingEmotion, string> = {
  neutral: '',
  happy: '[happy]',
  excited: '[excited]',
  annoyed: '[annoyed]',
  angry: '[angry]',
  worried: '[worried]',
  laughing: '[laughs]',
  proud: '[proud]',
  sad: '[sad]',
  confident: '[confident]',
  determined: '[determined]',
  surprised: '[surprised]',
  moved: '[emotional]',
};

/** 台詞前面加上情緒 audio tag(neutral 或未知情緒則原樣回傳) */
export function applyEmotionTag(text: string, emotion?: string): string {
  const tag = emotion ? EMOTION_AUDIO_TAG[emotion as MeetingEmotion] ?? '' : '';
  return tag ? `${tag} ${text}` : text;
}

export interface DialogueInput {
  /** 台詞內容(可含 [laughs] 等 inline audio tag) */
  text: string;
  /** 這句台詞使用的 ElevenLabs voice_id */
  voiceId: string;
}

/**
 * 呼叫 Text-to-Dialogue,把一段多人對話合成為一支音檔,回傳 mp3 bytes。
 * 呼叫端需自行確保 inputs 總字數不超過 DIALOGUE_CHAR_LIMIT。
 */
export async function synthesizeDialogue(
  env: Env,
  params: {
    inputs: DialogueInput[];
    /** ISO 639-1 語言碼;預設不送,讓模型自動偵測(v3 對 language_code 支援有限) */
    languageCode?: string;
    /** 0 有情緒有變化 / 0.5 均衡 / 1 最穩定,預設 0.5 */
    stability?: number;
  },
): Promise<Uint8Array> {
  const apiKey = requireApiKey(env);
  if (!params.inputs.length) throw new ElevenLabsError(400, 'inputs 不可為空');

  const res = await fetch(`${ELEVENLABS_BASE}/text-to-dialogue?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey },
    body: JSON.stringify({
      model_id: 'eleven_v3',
      ...(params.languageCode ? { language_code: params.languageCode } : {}),
      inputs: params.inputs.map((i) => ({ text: i.text, voice_id: i.voiceId })),
      settings: { stability: params.stability ?? 0.5 },
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ElevenLabsError(res.status, `ElevenLabs text-to-dialogue 失敗 (${res.status}): ${text.slice(0, 300)}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}
