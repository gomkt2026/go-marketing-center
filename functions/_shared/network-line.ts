import type { Env } from './env';
import { getSql } from './db';
import { getBrandBySlug } from './queries';
import { DEFAULT_PUBLIC_BASE, buildNetworkCardKey, putMedia } from './media';
import { ensureNetworkTables, upsertNetworkContact } from './network-contacts';
import { bytesToDataUrl, draftFromOcr, ocrBusinessCard } from './network-ocr';
import { classifyVendorAsk, formatMatchText, logNetworkMatch, looksLikeVendorAsk, searchVendors } from './network-match';

const LINE_API = 'https://api.line.me/v2/bot';
const LINE_DATA = 'https://api-data.line.me/v2/bot';

export interface LineWebhookBody {
  events?: LineEvent[];
}

export interface LineEvent {
  type: string;
  replyToken?: string;
  source?: { type?: string; userId?: string; groupId?: string; roomId?: string };
  message?: { id?: string; type?: string; text?: string };
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

async function downloadLineImage(env: Env, messageId: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  const res = await fetch(`${LINE_DATA}/message/${messageId}/content`, {
    headers: { Authorization: `Bearer ${requireToken(env)}` },
  });
  if (!res.ok) throw new Error(`下載 LINE 圖片失敗 (${res.status})`);
  const contentType = res.headers.get('content-type') || 'image/jpeg';
  return { bytes: new Uint8Array(await res.arrayBuffer()), contentType };
}

function textMsg(text: string) {
  return { type: 'text', text };
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
      '你好，我是 FIXERCOWORK 人脈小幫手。\n\n傳名片照片給我，我會辨識後寫進品牌人脈庫。\n在群組問「有沒有做○○的廠商」，我會幫你找名單。',
    )]);
    return;
  }

  if (event.type === 'join' && event.replyToken) {
    await replyLine(env, event.replyToken, [textMsg(
      '我已加入群組。之後有人問廠商，或丟名片進來，我會幫忙整理進人脈庫。完整名單會盡量私訊，避免洗版。',
    )]);
    return;
  }

  if (event.type !== 'message' || !event.message) return;

  const messageType = event.message.type ?? '';
  const text = event.message.text ?? null;

  await sql`
    INSERT INTO line_network_inbox (brand_id, line_user_id, line_group_id, event_type, message_type, text, raw)
    VALUES (
      ${brandId}::uuid, ${userId}, ${groupId}, ${event.type}, ${messageType}, ${text},
      ${JSON.stringify({ type: event.type, source: event.source, messageType })}::jsonb
    )
  `;

  if (messageType === 'image' && event.message.id) {
    if (event.replyToken) {
      await replyLine(env, event.replyToken, [textMsg('收到照片，正在辨識是不是名片…')]).catch(() => undefined);
    }
    const image = await downloadLineImage(env, event.message.id);
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
    const msg = `已寫進人脈庫（待人工確認）：${summary}`;
    if (userId) {
      const pushed = await pushLine(env, userId, [textMsg(msg)]);
      if (!pushed && !event.replyToken) {
        // reply token 已用於「正在辨識」
      }
    }
    return;
  }

  if (messageType === 'text' && text) {
    if (!looksLikeVendorAsk(text)) return;
    if (event.replyToken) {
      await replyLine(env, event.replyToken, [textMsg(groupId ? '收到，我先幫你找人，名單會盡量私訊。' : '收到，正在幫你找合適廠商…')]).catch(() => undefined);
    }
    const ask = await classifyVendorAsk(env, text);
    if (!ask.isVendorAsk) return;
    const matches = await searchVendors(env, brandId, ask);
    await logNetworkMatch(env, {
      brandId,
      queryText: text,
      ask,
      matches,
      lineUserId: userId,
      lineGroupId: groupId,
    });
    const detail = formatMatchText(ask, matches);
    let pushed = false;
    if (userId) pushed = await pushLine(env, userId, [textMsg(detail)]);
    if (!pushed && groupId) {
      const short = matches.length
        ? `已找到 ${matches.length} 位「${ask.category ?? '相關'}」人選。請先加我好友，才能私訊完整聯絡方式。`
        : `人脈庫暫時沒有「${ask.category ?? '這個工種'}」的現成名單，我先記下來。`;
      if (userId) {
        await pushLine(env, groupId, [textMsg(short)]);
      }
    }
  }
}

export function publicWebhookUrl(env: Env): string {
  const base = (env.PUBLIC_BASE_URL ?? DEFAULT_PUBLIC_BASE).replace(/\/$/, '');
  return `${base}/api/webhooks/line/network`;
}
