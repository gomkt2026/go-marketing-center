import type { Env } from './env';
import { chatCompleteJson, type ChatContentPart } from './openai';
import { asStringList, cleanText, parseDispatch, parseYears, type NetworkContactDraft } from './network-contacts';

export interface CardOcrResult {
  isBusinessCard: boolean;
  skipReason: string | null;
  name: string | null;
  nameEn: string | null;
  company: string | null;
  title: string | null;
  phone: string | null;
  email: string | null;
  lineId: string | null;
  website: string | null;
  address: string | null;
  industry: string | null;
  specialties: string[];
  serviceRegions: string[];
  yearsExperience: number | null;
  acceptsDispatch: boolean | null;
  notes: string | null;
  rawText: string;
  confidence: number;
}

const OCR_SYSTEM = `你是台灣修繕／工程／商會人脈名片辨識助手。請閱讀圖片，判斷是不是名片、宣傳單或聯絡卡。
若是工地照片、群組聊天截圖、貼圖、風景、無聯絡資訊的海報，isBusinessCard=false。
只抽取看得到的資訊，不要發明電話或 Email。電話請盡量轉成台灣手機格式(09xxxxxxxx)或市話。
專長與服務地區請拆成短詞陣列。回傳 JSON。`;

export async function ocrBusinessCard(env: Env, imageUrl: string): Promise<CardOcrResult> {
  const content: ChatContentPart[] = [
    {
      type: 'text',
      text: '請辨識這張圖。回傳 JSON:' +
        '{"isBusinessCard":true/false,"skipReason":"不是名片時說明","name":"姓名","nameEn":"英文名","company":"公司或品牌",' +
        '"title":"職稱","phone":"電話","email":"email","lineId":"LINE ID 或 @官方帳號","website":"網址",' +
        '"address":"地址","industry":"產業別","specialties":["專長"],"serviceRegions":["服務地區"],' +
        '"yearsExperience":null,"notes":"其他有用資訊","rawText":"圖上可見文字摘要","confidence":0到1}',
    },
    { type: 'image_url', image_url: { url: imageUrl } },
  ];

  const raw = await chatCompleteJson<Partial<CardOcrResult>>(env, {
    messages: [
      { role: 'system', content: OCR_SYSTEM },
      { role: 'user', content },
    ],
    temperature: 0.1,
    maxTokens: 1200,
  });

  const specialties = asStringList(raw.specialties);
  const serviceRegions = asStringList(raw.serviceRegions);
  const name = cleanText(raw.name) ?? cleanText(raw.company);
  const isBusinessCard = raw.isBusinessCard !== false && Boolean(name || cleanText(raw.phone) || cleanText(raw.email));

  return {
    isBusinessCard,
    skipReason: cleanText(raw.skipReason),
    name,
    nameEn: cleanText(raw.nameEn),
    company: cleanText(raw.company),
    title: cleanText(raw.title),
    phone: cleanText(raw.phone),
    email: cleanText(raw.email),
    lineId: cleanText(raw.lineId),
    website: cleanText(raw.website),
    address: cleanText(raw.address),
    industry: cleanText(raw.industry),
    specialties,
    serviceRegions,
    yearsExperience: parseYears(raw.yearsExperience),
    acceptsDispatch: parseDispatch(raw.acceptsDispatch),
    notes: cleanText(raw.notes),
    rawText: cleanText(raw.rawText) ?? '',
    confidence: clampConfidence(raw.confidence),
  };
}

function clampConfidence(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0.6;
  return Math.min(1, Math.max(0, n));
}

export function draftFromOcr(
  ocr: CardOcrResult,
  source: 'business_card' | 'line_chat',
  extras: { sourceRef?: string; cardImageUrl?: string; lineUserId?: string },
): NetworkContactDraft {
  return {
    name: ocr.name ?? ocr.company ?? '未命名',
    nameEn: ocr.nameEn,
    company: ocr.company,
    title: ocr.title,
    phone: ocr.phone,
    email: ocr.email,
    lineId: ocr.lineId,
    lineUserId: extras.lineUserId ?? null,
    website: ocr.website,
    address: ocr.address,
    industry: ocr.industry,
    specialties: ocr.specialties,
    serviceRegions: ocr.serviceRegions,
    yearsExperience: ocr.yearsExperience,
    acceptsDispatch: ocr.acceptsDispatch,
    notes: ocr.notes,
    rawOcr: ocr.rawText,
    cardImageUrl: extras.cardImageUrl ?? null,
    source,
    sourceRef: extras.sourceRef ?? null,
    status: 'pending_review',
    confidence: ocr.confidence,
  };
}

export function bytesToDataUrl(bytes: Uint8Array, contentType: string): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:${contentType};base64,${btoa(binary)}`;
}
