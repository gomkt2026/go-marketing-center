import { extractPdfText } from './documents';

const MAX_EXTRACT_CHARS = 40000;

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as unknown as ArrayBuffer]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function readZipCString(bytes: Uint8Array, start: number, len: number): string {
  return new TextDecoder().decode(bytes.subarray(start, start + len));
}

/** 從 DOCX(ZIP) 抽出 word/document.xml 的可見文字 */
export async function extractDocxText(bytes: Uint8Array): Promise<string> {
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
      const next = bytes.subarray(dataStart).findIndex((_, i, arr) => (
        i + 3 < arr.length && arr[i] === 0x50 && arr[i + 1] === 0x4b && arr[i + 2] === 0x03 && arr[i + 3] === 0x04
      ));
      if (next < 0) break;
      offset = dataStart + next;
      continue;
    }
    const dataEnd = dataStart + compSize;
    if (dataEnd > bytes.length) break;
    if (/^word\/document\.xml$/i.test(name)) {
      try {
        const payload = method === 8
          ? await inflateRaw(bytes.subarray(dataStart, dataEnd))
          : bytes.subarray(dataStart, dataEnd);
        const xml = new TextDecoder().decode(payload);
        const parts = [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).filter(Boolean);
        if (parts.length) texts.push(parts.join(''));
      } catch { /* 單檔失敗略過 */ }
    }
    offset = dataEnd;
  }
  return texts.join('\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_EXTRACT_CHARS);
}

export function extractPlainText(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes).replace(/^\uFEFF/, '').trim().slice(0, MAX_EXTRACT_CHARS);
}

export type CsFileKind = 'markdown' | 'pdf' | 'docx' | 'unsupported';

export function classifyCsFile(fileName: string, mimeType: string): CsFileKind {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.md') || lower.endsWith('.txt') || mimeType.startsWith('text/')) return 'markdown';
  if (lower.endsWith('.pdf') || mimeType === 'application/pdf') return 'pdf';
  if (
    lower.endsWith('.docx')
    || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) return 'docx';
  return 'unsupported';
}

export async function extractCsDocumentText(params: {
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
}): Promise<{ text: string; status: 'ready' | 'failed'; error?: string }> {
  const kind = classifyCsFile(params.fileName, params.mimeType);
  if (kind === 'unsupported') {
    return {
      text: '',
      status: 'failed',
      error: '請上傳 MD、TXT、PDF 或 Word（.docx）。舊版 .doc 請另存 docx 或改傳 MD。',
    };
  }

  let text = '';
  try {
    if (kind === 'markdown') text = extractPlainText(params.bytes);
    else if (kind === 'pdf') text = extractPdfText(params.bytes, MAX_EXTRACT_CHARS);
    else text = await extractDocxText(params.bytes);
  } catch (e) {
    return { text: '', status: 'failed', error: e instanceof Error ? e.message : '無法讀取檔案' };
  }

  const cleaned = text.replace(/\s+\n/g, '\n').trim();
  if (cleaned.length < 20) {
    return {
      text: cleaned,
      status: 'failed',
      error: kind === 'pdf'
        ? '無法從 PDF 抽出足夠文字。掃描檔請改傳可選取文字的 PDF，或改傳 MD／Word。'
        : '檔案內容太短，請確認不是空檔。',
    };
  }
  return { text: cleaned.slice(0, MAX_EXTRACT_CHARS), status: 'ready' };
}
