import type { Env } from './env';
import { getSql } from './db';
import { getBrandBySlug } from './queries';
import { DEFAULT_PUBLIC_BASE, buildNetworkCardKey, putMedia, toPublicMediaUrl } from './media';
import { ensureNetworkTables, upsertNetworkContact, type NetworkContactRecord } from './network-contacts';
import { bytesToDataUrl, draftFromOcr, ocrBusinessCard } from './network-ocr';
import { classifyVendorAsk, contactLineUri, contactTelUri, formatMatchText, logNetworkMatch, looksLikeNudge, looksLikeVendorAsk, searchVendors, type RankedContact, type VendorAsk } from './network-match';
import { pickAckText, toTaiwanText } from './network-trades';
import { speakAsXiaomi, spokenMatchScript, transcribeLineAudio } from './network-voice';

const LINE_API = 'https://api.line.me/v2/bot';
const LINE_DATA = 'https://api-data.line.me/v2/bot';

export interface LineWebhookBody {
  events?: LineEvent[];
}

export interface LineEvent {
  type: string;
  replyToken?: string;
  source?: { type?: string; userId?: string; groupId?: string; roomId?: string };
  message?: { id?: string; type?: string; text?: string; duration?: number };
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export async function verifyLineSignature(rawBody: string, signature: string | null, secret: string): Promise<boolean> {
  if (!signature || !secret) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const expected = encodeBase64(new Uint8Array(sig));
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

export function lineNetworkConfigured(env: Env): { configured: boolean; brandSlug: string; webhookPath: string } {
  return {
    configured: Boolean(env.LINE_NETWORK_CHANNEL_SECRET && env.LINE_NETWORK_CHANNEL_ACCESS_TOKEN),
    brandSlug: env.LINE_NETWORK_BRAND_SLUG || 'fixercowork',
    webhookPath: '/api/webhooks/line/network',
  };
}

function requireToken(env: Env): string {
  if (!env.LINE_NETWORK_CHANNEL_ACCESS_TOKEN) {
    throw new Error('LINE_NETWORK_CHANNEL_ACCESS_TOKEN 尚未設定');
  }
  return env.LINE_NETWORK_CHANNEL_ACCESS_TOKEN;
}

async function linePost(env: Env, path: string, body: unknown): Promise<void> {
  const res = await fetch(`${LINE_API}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${requireToken(env)}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`LINE API ${path} 失敗 (${res.status}): ${text.slice(0, 200)}`);
  }
}

export async function replyLine(env: Env, replyToken: string, messages: unknown[]): Promise<void> {
  await linePost(env, '/message/reply', { replyToken, messages });
}

export async function pushLine(env: Env, to: string, messages: unknown[]): Promise<boolean> {
  try {
    await linePost(env, '/message/push', { to, messages });
    return true;
  } catch {
    return false;
  }
}

async function downloadLineContent(env: Env, messageId: string, fallbackType: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  const res = await fetch(`${LINE_DATA}/message/${messageId}/content`, {
    headers: { Authorization: `Bearer ${requireToken(env)}` },
  });
  if (!res.ok) throw new Error(`下載 LINE 內容失敗 (${res.status})`);
  const contentType = res.headers.get('content-type') || fallbackType;
  return { bytes: new Uint8Array(await res.arrayBuffer()), contentType };
}

function textMsg(text: string) {
  return { type: 'text', text };
}

function flexText(text: string, extra: Record<string, unknown> = {}) {
  return { type: 'text', text, wrap: true, ...extra };
}

function contactBubble(env: Env, contact: NetworkContactRecord) {
  const tel = contactTelUri(contact.phone);
  const line = contactLineUri(contact.lineId);
  const imageUrl = toPublicMediaUrl(env, contact.cardImageUrl);
  const body = [
    flexText(contact.name || contact.company || '人脈', { weight: 'bold', size: 'lg' }),
    contact.company && contact.company !== contact.name
      ? flexText(`🏢 ${contact.company}`, { size: 'sm', color: '#555555' })
      : null,
    contact.industry ? flexText(`🏷️ ${contact.industry}`, { size: 'xs', color: '#1A2F4B' }) : null,
    contact.specialties.length
      ? flexText(`🛠️ ${contact.specialties.slice(0, 4).join('、')}`, { size: 'xs', color: '#666666' })
      : null,
    contact.phone
      ? flexText(`📞 ${contact.phone}`, {
        size: 'sm',
        color: '#1A2F4B',
        decoration: 'underline',
        ...(tel ? { action: { type: 'uri', uri: tel } } : {}),
      })
      : null,
    contact.lineId
      ? flexText(`💬 ${contact.lineId}`, {
        size: 'sm',
        color: '#06C755',
        decoration: 'underline',
        ...(line ? { action: { type: 'uri', uri: line } } : {}),
      })
      : null,
  ].filter(Boolean);

  const buttons: Record<string, unknown>[] = [];
  if (tel) {
    buttons.push({
      type: 'button', style: 'primary', height: 'md', color: '#1A2F4B',
      action: { type: 'uri', label: '📞 打電話', uri: tel },
    });
  }
  if (line) {
    buttons.push({
      type: 'button', style: 'primary', height: 'md', color: '#06C755',
      action: { type: 'uri', label: '💬 加 LINE', uri: line },
    });
  }

  return {
    type: 'bubble',
    size: 'mega',
    ...(imageUrl
      ? {
        hero: {
          type: 'image',
          url: imageUrl,
          size: 'full',
          aspectRatio: '16:10',
          aspectMode: 'cover',
        },
      }
      : {
        header: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#1A2F4B',
          paddingAll: '12px',
          contents: [flexText('📇 人脈名片', { color: '#FFFFFF', size: 'sm', weight: 'bold' })],
        },
      }),
    body: { type: 'box', layout: 'vertical', spacing: 'sm', contents: body },
    ...(buttons.length
      ? { footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: buttons } }
      : {}),
  };
}

function matchMessages(env: Env, ask: VendorAsk, matches: RankedContact[]): unknown[] {
  const intro = formatMatchText(ask, matches);
  if (!matches.length) return [textMsg(intro)];
  return [
    textMsg(intro),
    {
      type: 'flex',
      altText: intro.slice(0, 390),
      contents: {
        type: 'carousel',
        contents: matches.map((item) => contactBubble(env, item.contact)),
      },
    },
  ];
}

async function ackFirst(env: Env, event: LineEvent, text: string): Promise<boolean> {
  if (!event.replyToken) return false;
  try {
    await replyLine(env, event.replyToken, [textMsg(text)]);
    return true;
  } catch {
    return false;
  }
}

async function lastVendorAskInThread(
  env: Env,
  brandId: string,
  groupId: string | null,
  userId: string | null,
): Promise<string | null> {
  const sql = getSql(env);
  const rows = groupId
    ? await sql`
        SELECT text FROM line_network_inbox
        WHERE brand_id = ${brandId}::uuid
          AND line_group_id = ${groupId}
          AND text IS NOT NULL AND text <> ''
        ORDER BY created_at DESC
        LIMIT 20
      `
    : await sql`
        SELECT text FROM line_network_inbox
        WHERE brand_id = ${brandId}::uuid
          AND line_user_id = ${userId}
          AND text IS NOT NULL AND text <> ''
        ORDER BY created_at DESC
        LIMIT 20
      `;
  for (const row of rows as { text?: string }[]) {
    const t = String(row.text ?? '').trim();
    if (!t || looksLikeNudge(t)) continue;
    if (looksLikeVendorAsk(t)) return t;
  }
  return null;
}

async function deliverAskResult(
  env: Env,
  brandSlug: string,
  event: LineEvent,
  ask: VendorAsk,
  matches: RankedContact[],
  opts: { preferVoice: boolean; replyUsed: boolean; heard?: string },
): Promise<void> {
  const messages = matchMessages(env, ask, matches);
  if (opts.heard && messages[0] && typeof messages[0] === 'object' && 'text' in messages[0]) {
    const first = messages[0] as { type: string; text: string };
    first.text = `我聽到：「${opts.heard}」\n\n${first.text}`;
  }
  if (opts.preferVoice) {
    try {
      const audio = await speakAsXiaomi(env, brandSlug, spokenMatchScript(ask, matches));
      if (audio) {
        messages.unshift({
          type: 'audio',
          originalContentUrl: audio.url,
          duration: audio.durationMs,
        });
      }
    } catch (err) {
      console.error('xiaomi tts failed', err instanceof Error ? err.message : err);
    }
  }
  if (!opts.replyUsed) {
    await replyOrPush(env, event, messages);
    return;
  }
  const to = event.source?.groupId ?? event.source?.roomId ?? event.source?.userId;
  if (to) await pushLine(env, to, messages);
}

async function processVendorAsk(
  env: Env,
  brandId: string,
  brandSlug: string,
  event: LineEvent,
  text: string,
  opts: { preferVoice: boolean; replyUsed: boolean },
): Promise<void> {
  const ask = await classifyVendorAsk(env, text);
  if (!ask.isVendorAsk) {
    const msg = textMsg('這則我先當一般討論。若要找廠商，直接說工種就好，例如修馬桶、壁癌、搬家。');
    if (opts.replyUsed) {
      const to = event.source?.groupId ?? event.source?.roomId ?? event.source?.userId;
      if (to) await pushLine(env, to, [msg]);
    } else {
      await replyOrPush(env, event, [msg]);
    }
    return;
  }
  const matches = await searchVendors(env, brandId, ask);
  await logNetworkMatch(env, {
    brandId,
    queryText: text,
    ask,
    matches,
    lineUserId: event.source?.userId ?? null,
    lineGroupId: event.source?.groupId ?? event.source?.roomId ?? null,
  });
  await deliverAskResult(env, brandSlug, event, ask, matches, {
    ...opts,
    heard: opts.preferVoice ? toTaiwanText(text) : undefined,
  });
}

async function replyOrPush(env: Env, event: LineEvent, messages: unknown[]): Promise<void> {
  if (event.replyToken) {
    try {
      await replyLine(env, event.replyToken, messages);
      return;
    } catch {
      // replyToken 可能已過期,改推到群組或私訊
    }
  }
  const to = event.source?.groupId ?? event.source?.roomId ?? event.source?.userId;
  if (to) await pushLine(env, to, messages);
}

export async function handleLineNetworkEvents(env: Env, body: LineWebhookBody): Promise<void> {
  const events = body.events ?? [];
  const slug = env.LINE_NETWORK_BRAND_SLUG || 'fixercowork';
  const brand = await getBrandBySlug(env, slug);
  if (!brand) return;
  await ensureNetworkTables(env);

  for (const event of events) {
    try {
      await handleOneEvent(env, brand.id, brand.slug, event);
    } catch (err) {
      console.error('line network event failed', err instanceof Error ? err.message : err);
    }
  }
}

async function handleOneEvent(env: Env, brandId: string, brandSlug: string, event: LineEvent): Promise<void> {
  const sql = getSql(env);
  const userId = event.source?.userId ?? null;
  const groupId = event.source?.groupId ?? event.source?.roomId ?? null;

  if (event.type === 'follow' && event.replyToken) {
    await replyLine(env, event.replyToken, [textMsg(
      '你好，我是 FIXERCOWORK 人脈小幫手。\n\n傳名片照片給我，我會辨識後寫進品牌人脈庫。\n在群組問「修馬桶、壁癌、搬家」這類，我會幫你找名單。工班開車也能傳語音，小咪會用講的回你。',
    )]);
    return;
  }

  if (event.type === 'join' && event.replyToken) {
    await replyLine(env, event.replyToken, [textMsg(
      '我已加入群組。問修馬桶、壁癌、水電、搬家這類，我會用人脈庫回卡片。也可以傳語音，小咪會聽完再用講的回。傳名片照片也會幫你建檔。',
    )]);
    return;
  }

  if (event.type !== 'message' || !event.message) return;

  const messageType = event.message.type ?? '';
  const text = event.message.text ?? null;

  const inserted = await sql`
    INSERT INTO line_network_inbox (brand_id, line_user_id, line_group_id, event_type, message_type, text, raw)
    VALUES (
      ${brandId}::uuid, ${userId}, ${groupId}, ${event.type}, ${messageType}, ${text},
      ${JSON.stringify({ type: event.type, source: event.source, messageType })}::jsonb
    )
    RETURNING id
  `;
  const inboxId = (inserted[0] as { id?: string } | undefined)?.id ?? null;

  if (messageType === 'image' && event.message.id) {
    if (event.replyToken) {
      await replyLine(env, event.replyToken, [textMsg('收到照片，正在辨識是不是名片…')]).catch(() => undefined);
    }
    const image = await downloadLineContent(env, event.message.id, 'image/jpeg');
    const ext = image.contentType.includes('png') ? 'png' : 'jpg';
    let cardImageUrl: string | null = null;
    try {
      cardImageUrl = await putMedia(env, buildNetworkCardKey(brandSlug, ext), image.bytes, image.contentType);
    } catch {
      cardImageUrl = null;
    }
    const dataUrl = bytesToDataUrl(image.bytes, image.contentType);
    const ocr = await ocrBusinessCard(env, dataUrl);
    if (!ocr.isBusinessCard) {
      if (userId) {
        await pushLine(env, userId, [textMsg(ocr.skipReason || '這張比較像現場照片，我先不寫進名片庫。若是名片請拍清楚正面再傳一次。')]);
      }
      return;
    }
    const { contact } = await upsertNetworkContact(env, brandId, draftFromOcr(ocr, 'line_chat', {
      sourceRef: event.message.id,
      cardImageUrl: cardImageUrl ?? undefined,
      lineUserId: userId ?? undefined,
    }));
    const summary = [contact.name, contact.company, contact.phone, contact.specialties.slice(0, 2).join('、')]
      .filter(Boolean)
      .join(' ｜ ');
    const msg = `已寫進人脈庫：${summary}`;
    const to = groupId ?? userId;
    if (to) await pushLine(env, to, [textMsg(msg)]);
    return;
  }

  if (messageType === 'audio' && event.message.id) {
    const replyUsed = await ackFirst(env, event, pickAckText('audio'));
    try {
      const audio = await downloadLineContent(env, event.message.id, 'audio/mp4');
      const transcript = await transcribeLineAudio(env, audio.bytes, audio.contentType);
      if (inboxId && transcript) {
        await sql`UPDATE line_network_inbox SET text = ${transcript} WHERE id = ${inboxId}::uuid`;
      }
      if (!transcript) {
        const msg = textMsg(env.ELEVENLABS_API_KEY
          ? '語音我沒聽清楚，可以再說一次，或直接打字工種給我，例如修馬桶、壁癌。'
          : '這台目前還沒接語音，先打字給我工種，例如修馬桶、壁癌。');
        const to = groupId ?? userId;
        if (replyUsed && to) await pushLine(env, to, [msg]);
        else await replyOrPush(env, event, [msg]);
        return;
      }
      await processVendorAsk(env, brandId, brandSlug, event, transcript, { preferVoice: true, replyUsed });
    } catch (err) {
      console.error('line audio failed', err instanceof Error ? err.message : err);
      const msg = textMsg('語音這則我先沒對上，你打字再說一次工種，我馬上幫你找。');
      const to = groupId ?? userId;
      if (replyUsed && to) await pushLine(env, to, [msg]);
      else await replyOrPush(env, event, [msg]);
    }
    return;
  }

  if (messageType === 'text' && text) {
    if (looksLikeNudge(text)) {
      const replyUsed = await ackFirst(env, event, pickAckText('nudge'));
      const prev = await lastVendorAskInThread(env, brandId, groupId, userId);
      if (!prev) {
        const msg = textMsg('在！你直接講工種就好，例如修馬桶、壁癌、搬家，我幫你對人脈庫。');
        if (replyUsed) {
          const to = groupId ?? userId;
          if (to) await pushLine(env, to, [msg]);
        } else {
          await replyOrPush(env, event, [msg]);
        }
        return;
      }
      await processVendorAsk(env, brandId, brandSlug, event, prev, { preferVoice: false, replyUsed });
      return;
    }

    if (!looksLikeVendorAsk(text)) return;
    const replyUsed = await ackFirst(env, event, pickAckText('ask'));
    await processVendorAsk(env, brandId, brandSlug, event, text, { preferVoice: false, replyUsed });
  }
}

export function publicWebhookUrl(env: Env): string {
  const base = (env.PUBLIC_BASE_URL ?? DEFAULT_PUBLIC_BASE).replace(/\/$/, '');
  return `${base}/api/webhooks/line/network`;
}
