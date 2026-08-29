import type { Env } from './env';
import { getSql } from './db';
import { toPublicMediaUrl } from './media';
import { chatComplete } from './openai';
import { collateralKindLabel, type BrandDocumentRow } from './documents';

const CUSTOMER_CONTACT = '想來信詢問：Service@inforcraft.com.tw，或來電 0972-395-117';

export function isMissingWebsiteColumn(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /column ["']?website_(url|note)["']? does not exist/i.test(msg);
}

export async function applyBrandWebsiteMigration(env: Env): Promise<string[]> {
  const sql = getSql(env);
  await sql`ALTER TABLE brands ADD COLUMN IF NOT EXISTS website_url TEXT`;
  await sql`ALTER TABLE brands ADD COLUMN IF NOT EXISTS website_note TEXT`;
  await sql`
    UPDATE brands
    SET website_url = COALESCE(website_url, 'https://app.taskgo.com.tw'),
        website_note = COALESCE(website_note, '產品入口與註冊頁,價格與方案以官網為準')
    WHERE slug = 'taskgo'
  `;
  return ['columns:brands.website', 'seed:taskgo'];
}

export async function loadBrandWebsite(env: Env, brandId: string): Promise<{ websiteUrl: string | null; websiteNote: string | null }> {
  const sql = getSql(env);
  try {
    const rows = await sql`
      SELECT website_url, website_note FROM brands WHERE id = ${brandId}::uuid LIMIT 1
    `;
    const row = rows[0] as { website_url?: string | null; website_note?: string | null } | undefined;
    return { websiteUrl: row?.website_url ?? null, websiteNote: row?.website_note ?? null };
  } catch (e) {
    if (!isMissingWebsiteColumn(e)) return { websiteUrl: null, websiteNote: null };
    try {
      await applyBrandWebsiteMigration(env);
      const rows = await sql`
        SELECT website_url, website_note FROM brands WHERE id = ${brandId}::uuid LIMIT 1
      `;
      const row = rows[0] as { website_url?: string | null; website_note?: string | null } | undefined;
      return { websiteUrl: row?.website_url ?? null, websiteNote: row?.website_note ?? null };
    } catch {
      return { websiteUrl: null, websiteNote: null };
    }
  }
}

export function officialWebsitePrompt(url: string | null | undefined, note: string | null | undefined): string {
  if (!url && !note) return '';
  return [
    '官方網站(給客戶查詢與 LINE 資訊包使用;社群貼文主 CTA 仍走匠管,不要把官網當發文主 CTA):',
    url ? `- 網址:${url}` : '',
    note ? `- 說明:${note}` : '',
  ].filter(Boolean).join('\n');
}

function filePublicUrl(env: Env, fileUrl: string | null): string | null {
  return toPublicMediaUrl(env, fileUrl);
}

export function composeLineMessageTemplate(params: {
  brandName: string;
  tagline?: string | null;
  websiteUrl?: string | null;
  websiteNote?: string | null;
  docs: BrandDocumentRow[];
  fileUrls: Record<string, string>;
}): string {
  const blocks: string[] = [];
  blocks.push(`您好，這邊先把 ${params.brandName} 的資料整理給您參考。`);
  if (params.tagline) blocks.push(params.tagline);

  const edms = params.docs.filter((d) => d.sourceType === 'dm');
  const decks = params.docs.filter((d) => d.sourceType === 'presentation');

  const writeDocs = (title: string, items: BrandDocumentRow[]) => {
    if (!items.length) return;
    blocks.push('');
    blocks.push(`【${title}】`);
    for (const doc of items) {
      blocks.push(`・${doc.title}`);
      if (doc.rawContent) blocks.push(`  ${doc.rawContent}`);
      for (const point of doc.keyPoints.slice(0, 4)) blocks.push(`  - ${point}`);
      const url = params.fileUrls[doc.id];
      if (url) blocks.push(`  檔案：${url}`);
    }
  };

  writeDocs('EDM／活動資料', edms);
  writeDocs('產品簡報', decks);

  if (params.websiteUrl || params.websiteNote) {
    blocks.push('');
    blocks.push('【官方網站】');
    if (params.websiteNote) blocks.push(params.websiteNote);
    if (params.websiteUrl) blocks.push(params.websiteUrl);
  }

  blocks.push('');
  blocks.push(`若還需要補充，直接回這則訊息即可。也可以來信或來電：${CUSTOMER_CONTACT}`);
  return blocks.join('\n');
}

export async function composeCustomerLineMessage(
  env: Env,
  params: {
    brandName: string;
    tagline?: string | null;
    websiteUrl?: string | null;
    websiteNote?: string | null;
    docs: BrandDocumentRow[];
    customerHint?: string;
  },
): Promise<{ message: string; files: { id: string; title: string; kind: string; url: string }[] }> {
  const fileUrls: Record<string, string> = {};
  const files: { id: string; title: string; kind: string; url: string }[] = [];
  for (const doc of params.docs) {
    const url = filePublicUrl(env, doc.fileUrl);
    if (url) {
      fileUrls[doc.id] = url;
      files.push({
        id: doc.id,
        title: doc.title,
        kind: collateralKindLabel(doc.sourceType),
        url,
      });
    }
  }

  const fallback = composeLineMessageTemplate({ ...params, fileUrls });
  const hint = params.customerHint?.trim();
  try {
    const polished = await chatComplete(env, {
      messages: [
        {
          role: 'system',
          content:
            '你是台灣業務,要把品牌資料寫成一則可直接貼到 LINE 的訊息。' +
            '語氣像真人傳訊:親切、短句、繁體中文。不要用 Markdown 標題符號。' +
            '必須完整保留我提供的所有檔案網址與官網網址,一個都不能改、不能省略。' +
            '不可發明優惠、價格、截止日。聯絡方式保留原句。',
        },
        {
          role: 'user',
          content: [
            hint ? `客戶目前想了解:${hint}` : '客戶想先看品牌資料。',
            '',
            '請把下面草稿改寫成一則 LINE 訊息,結構仍要包含 EDM/簡報重點、檔案連結、官方網站、聯絡方式:',
            fallback,
          ].join('\n'),
        },
      ],
      temperature: 0.4,
      maxTokens: 1200,
    });
    const message = polished.trim() || fallback;
    return { message, files };
  } catch {
    return { message: fallback, files };
  }
}
