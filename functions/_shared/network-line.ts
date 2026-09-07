import type { Env } from './env';
import { getSql } from './db';
import { getBrandBySlug } from './queries';
import { DEFAULT_PUBLIC_BASE, buildNetworkCardKey, putMedia, toPublicMediaUrl } from './media';
import { ensureNetworkTables, upsertNetworkContact, type NetworkContactRecord } from './network-contacts';
import { bytesToDataUrl, draftFromOcr, ocrBusinessCard } from './network-ocr';
import { classifyVendorAsk, contactLineUri, contactTelUri, formatMatchText, logNetworkMatch, looksLikeVendorAsk, searchVendors, type RankedContact, type VendorAsk } from './network-match';

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
      '你好，我是 FIXERCOWORK 人脈小幫手。\n\n傳名片照片給我，我會辨識後寫進品牌人脈庫。\n在群組問「有沒有做○○的廠商」，我會幫你找名單。',
    )]);
    return;
  }

  if (event.type === 'join' && event.replyToken) {
    await replyLine(env, event.replyToken, [textMsg(
      '我已加入群組。問「高雄有沒有水電／防水／冷氣」這類問題，我會用人脈庫回卡片，可直接通話或加 LINE。傳名片照片也會幫你建檔。',
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
    const msg = `已寫進人脈庫：${summary}`;
    const to = groupId ?? userId;
    if (to) await pushLine(env, to, [textMsg(msg)]);
    return;
  }

  if (messageType === 'text' && text) {
    if (!looksLikeVendorAsk(text)) return;
    const ask = await classifyVendorAsk(env, text);
    if (!ask.isVendorAsk) {
      await replyOrPush(env, event, [textMsg('這則我先當一般討論。若要找廠商，直接說工種和地區，例如「高雄水電有推薦嗎？」')]);
      return;
    }
    const matches = await searchVendors(env, brandId, ask);
    await logNetworkMatch(env, {
      brandId,
      queryText: text,
      ask,
      matches,
      lineUserId: userId,
      lineGroupId: groupId,
    });
    await replyOrPush(env, event, matchMessages(env, ask, matches));
  }
}

export function publicWebhookUrl(env: Env): string {
  const base = (env.PUBLIC_BASE_URL ?? DEFAULT_PUBLIC_BASE).replace(/\/$/, '');
  return `${base}/api/webhooks/line/network`;
}
