import type { Env } from './env';
import { ElevenLabsError } from './elevenlabs';

// ============================================================================
// ElevenLabs Scribe v2(speech-to-text,word-level 時間碼)
// 與 Podcast TTS(synthesizeDialogue)分開,不要混用。
// 文件:https://elevenlabs.io/docs/api-reference/speech-to-text/convert
// ============================================================================

const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1';

function requireApiKey(env: Env): string {
  if (!env.ELEVENLABS_API_KEY) {
    throw new ElevenLabsError(500, 'ELEVENLABS_API_KEY 尚未設定,請先執行 wrangler pages secret put ELEVENLABS_API_KEY');
  }
  return env.ELEVENLABS_API_KEY;
}

export interface ScribeWord {
  text: string;
  start: number;
  end: number;
  type: 'word' | 'spacing' | 'audio_event';
  speakerId?: string;
}

export interface ScribeTranscript {
  languageCode: string | null;
  text: string;
  words: ScribeWord[];
}

/**
 * 把音訊/影片送到 Scribe v2,取得 word-level 時間碼。
 * 呼叫端必須先取得使用者明確同意(檔名、用途、可能耗額度)。
 */
export async function transcribeWithScribe(
  env: Env,
  params: {
    fileBytes: Uint8Array;
    fileName: string;
    mimeType: string;
    languageCode?: string;
  },
): Promise<ScribeTranscript> {
  const apiKey = requireApiKey(env);
  const form = new FormData();
  form.append('model_id', 'scribe_v2');
  form.append('timestamps_granularity', 'word');
  form.append('diarize', 'true');
  if (params.languageCode) form.append('language_code', params.languageCode);
  form.append(
    'file',
    new Blob([params.fileBytes as unknown as ArrayBuffer], { type: params.mimeType }),
    params.fileName,
  );

  const res = await fetch(`${ELEVENLABS_BASE}/speech-to-text`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ElevenLabsError(res.status, `ElevenLabs Scribe v2 失敗 (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = await res.json() as {
    language_code?: string;
    text?: string;
    words?: { text?: string; start?: number; end?: number; type?: string; speaker_id?: string }[];
  };

  const words: ScribeWord[] = (data.words ?? [])
    .filter((w) => typeof w.start === 'number' && typeof w.end === 'number')
    .map((w) => ({
      text: w.text ?? '',
      start: w.start as number,
      end: w.end as number,
      type: (w.type === 'spacing' || w.type === 'audio_event' ? w.type : 'word') as ScribeWord['type'],
      speakerId: w.speaker_id,
    }));

  return {
    languageCode: data.language_code ?? null,
    text: data.text ?? words.map((w) => w.text).join(''),
    words,
  };
}
