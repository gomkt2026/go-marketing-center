import type { Env } from './env';
import { getSql } from './db';
import { rowToCamel } from './case';
import { chatCompleteJson, type ChatContentPart } from './openai';
import { applyDocumentCollateralMigration, isMissingDocumentCollateral } from './document-migrate';

export const COLLATERAL_SOURCE_TYPES = ['dm', 'presentation'] as const;
export type CollateralSourceType = (typeof COLLATERAL_SOURCE_TYPES)[number];

export type DocumentExtractStatus = 'pending' | 'ready' | 'failed';

export interface BrandDocumentRow {
  id: string;
  brandId: string;
  sourceType: string;
  title: string;
  fileUrl: string | null;
  rawContent: string | null;
  keyPoints: string[];
  extractStatus: DocumentExtractStatus;
  fileName: string | null;
  mimeType: string | null;
  createdAt?: string;
}

export function toBrandDocument(row: Record<string, unknown>): BrandDocumentRow {
  const camel = rowToCamel<Record<string, unknown>>(row);
  const points = camel.keyPoints;
  return {
    ...camel,
    keyPoints: Array.isArray(points) ? points.filter((p): p is string => typeof p === 'string' && !!p.trim()) : [],
    extractStatus: (camel.extractStatus === 'ready' || camel.extractStatus === 'failed' || camel.extractStatus === 'pending')
      ? camel.extractStatus
      : 'pending',
    rawContent: typeof camel.rawContent === 'string' ? camel.rawContent : null,
    fileUrl: typeof camel.fileUrl === 'string' ? camel.fileUrl : null,
    fileName: typeof camel.fileName === 'string' ? camel.fileName : null,
    mimeType: typeof camel.mimeType === 'string' ? camel.mimeType : null,
  } as BrandDocumentRow;
}

export function isCollateralType(value: string): value is CollateralSourceType {
  return (COLLATERAL_SOURCE_TYPES as readonly string[]).includes(value);
}

export function collateralKindLabel(sourceType: string): string {
  return sourceType === 'dm' ? 'EDM' : sourceType === 'presentation' ? '簡報' : sourceType;
}

export function documentTopicSummary(doc: BrandDocumentRow): string {
  const points = doc.keyPoints.length ? `可引用賣點:${doc.keyPoints.slice(0, 8).join('、')}` : '';
  return [
    `${collateralKindLabel(doc.sourceType)}《${doc.title}》`,
    doc.rawContent ?? '',
    points,
  ].filter(Boolean).join('\n');
}

export function collateralPrompt(docs: BrandDocumentRow[]): string {
  if (!docs.length) return '';
  const lines = docs.map((d) => {
    const points = d.keyPoints.length ? `：可引用${d.keyPoints.slice(0, 6).join('、')}` : '';
    const summary = d.rawContent ? `；摘要「${d.rawContent.slice(0, 80)}」` : '';
    return `- [${collateralKindLabel(d.sourceType)}]《${d.title}》${points}${summary}`;
  });
  return [
    '品牌官方 EDM／簡報(發文應優先引用下列已抽出的賣點、活動與 CTA;未列出的優惠、價格、截止日一律不准發明):',
    ...lines,
    '沒有列在上面的檔案內容、數字、贈品與期限一律不准寫。可以改寫語氣,不能改事實。',
  ].join('\n');
}

export async function loadBrandCollaterals(env: Env, brandId: string, limit = 8): Promise<BrandDocumentRow[]> {
  const sql = getSql(env);
  try {
    const rows = await sql`
      SELECT * FROM brand_documents
      WHERE brand_id = ${brandId}::uuid
        AND source_type IN ('dm', 'presentation')
        AND extract_status = 'ready'
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    return (rows as Record<string, unknown>[]).map(toBrandDocument);
  } catch (e) {
    if (!isMissingDocumentCollateral(e)) return [];
    try {
      await applyDocumentCollateralMigration(env);
    } catch {
      return [];
    }
    return [];
  }
}

export interface ExtractedCollateral {
  summary: string;
  keyPoints: string[];
}

const EXTRACT_SYSTEM = [
  '你是台灣行銷企劃,負責把品牌 DM 或簡報抽出「之後社群發文可以引用」的事實。',
  '只寫檔案裡明確出現的內容。沒看到的優惠、價格、截止日、贈品、數字不要發明。',
  '用台灣繁體中文。摘要 80 到 160 字,像給同事的重點說明。',
  'keyPoints 最多 8 則,每則一句,要具體(活動名、對象、方案、期限、CTA)。',
].join('');

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function normalizeExtract(raw: ExtractedCollateral): ExtractedCollateral {
  const summary = (raw.summary ?? '').trim().slice(0, 600);
  const keyPoints = (raw.keyPoints ?? [])
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 8);
  return { summary, keyPoints };
}

async function extractFromMessages(
  env: Env,
  content: string | ChatContentPart[],
): Promise<ExtractedCollateral> {
  const extracted = await chatCompleteJson<ExtractedCollateral>(env, {
    messages: [
      { role: 'system', content: EXTRACT_SYSTEM },
      { role: 'user', content },
    ],
    temperature: 0.2,
    maxTokens: 900,
  });
  return normalizeExtract(extracted);
}

/** 從 PDF bytes 抽出可見字串(適合文字型 PDF;掃描檔會很少) */
export function extractPdfText(bytes: Uint8Array): string {
  const latin = new TextDecoder('latin-1').decode(bytes);
  const chunks: string[] = [];
  const literal = /\((?:\\.|[^\\)]){2,200}\)/g;
  let match: RegExpExecArray | null;
  while ((match = literal.exec(latin))) {
    const inner = match[0].slice(1, -1)
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '')
      .replace(/\\t/g, ' ')
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')')
      .replace(/\\\\/g, '\\')
      .replace(/\\(\d{1,3})/g, (_, oct: string) => String.fromCharCode(parseInt(oct, 8)));
    if (/[\u4e00-\u9fffA-Za-z0-9]/.test(inner)) chunks.push(inner);
  }
  const hex = /<([0-9A-Fa-f \t]{8,})>/g;
  while ((match = hex.exec(latin))) {
    const hexStr = match[1].replace(/\s/g, '');
    if (hexStr.length % 4 !== 0) continue;
    try {
      const units: number[] = [];
      for (let i = 0; i < hexStr.length; i += 4) units.push(parseInt(hexStr.slice(i, i + 4), 16));
      const decoded = new TextDecoder('utf-16be').decode(new Uint16Array(units));
      if (/[\u4e00-\u9fff]/.test(decoded)) chunks.push(decoded);
    } catch { /* 略過解不開的 hex */ }
  }
  return chunks.join('').replace(/\s+/g, ' ').trim().slice(0, 12000);
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as unknown as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function readZipCString(bytes: Uint8Array, start: number, len: number): string {
  return new TextDecoder().decode(bytes.subarray(start, start + len));
}

/** 從 PPTX(ZIP) 抽出投影片文字 */
export async function extractPptxText(bytes: Uint8Array): Promise<string> {
  const texts: string[] = [];
  let offset = 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  while (offset + 30 < bytes.length) {
    if (view.getUint32(offset, true) !== 0x04034b50) break;
    const method = view.getUint16(offset + 8, true);
    const flags = view.getUint16(offset + 6, true);
    let compSize = view.getUint32(offset + 18, true);
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const name = readZipCString(bytes, nameStart, nameLen);
    let dataStart = nameStart + nameLen + extraLen;
    if ((flags & 0x8) && compSize === 0) {
      // data descriptor: 往後找下一個 local header 不可靠,略過此檔
      const next = bytes.subarray(dataStart).findIndex((_, i, arr) => (
        i + 3 < arr.length && arr[i] === 0x50 && arr[i + 1] === 0x4b && arr[i + 2] === 0x03 && arr[i + 3] === 0x04
      ));
      if (next < 0) break;
      offset = dataStart + next;
      continue;
    }
    const dataEnd = dataStart + compSize;
    if (dataEnd > bytes.length) break;
    if (/^ppt\/slides\/slide\d+\.xml$/i.test(name)) {
      try {
        const payload = method === 8
          ? await inflateRaw(bytes.subarray(dataStart, dataEnd))
          : bytes.subarray(dataStart, dataEnd);
        const xml = new TextDecoder().decode(payload);
        const parts = [...xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)].map((m) => m[1].trim()).filter(Boolean);
        if (parts.length) texts.push(parts.join(''));
      } catch { /* 單頁失敗不影響其他頁 */ }
    }
    offset = dataEnd;
  }
  return texts.join('\n').replace(/\s+/g, ' ').trim().slice(0, 12000);
}

export async function extractCollateralContent(
  env: Env,
  params: { bytes: Uint8Array; mimeType: string; fileName: string; kind: CollateralSourceType; notes?: string },
): Promise<ExtractedCollateral> {
  const kindLabel = collateralKindLabel(params.kind);
  const note = params.notes?.trim() ? `\n上傳者補充:${params.notes.trim()}` : '';
  const ask = `這是一份品牌${kindLabel}(${params.fileName})。請抽出摘要與可引用賣點。回傳 JSON:{"summary":"80到160字","keyPoints":["最多8則"]}${note}`;

  if (params.mimeType.startsWith('image/')) {
    const dataUrl = `data:${params.mimeType};base64,${bytesToBase64(params.bytes)}`;
    return extractFromMessages(env, [
      { type: 'text', text: ask },
      { type: 'image_url', image_url: { url: dataUrl } },
    ]);
  }

  let extractedText = '';
  if (params.mimeType === 'application/pdf' || params.fileName.toLowerCase().endsWith('.pdf')) {
    extractedText = extractPdfText(params.bytes);
  } else if (
    params.mimeType.includes('presentation')
    || params.fileName.toLowerCase().endsWith('.pptx')
  ) {
    extractedText = await extractPptxText(params.bytes);
  }

  if (extractedText.length < 40) {
    throw new Error('無法從檔案抽出足夠文字。掃描型 PDF 請改傳 JPG／PNG,或另存「文字可選取」的 PDF。');
  }

  return extractFromMessages(env, `${ask}\n\n檔案抽出的文字:\n${extractedText}`);
}
