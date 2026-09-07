import type { Env } from './env';
import { getSql } from './db';
import { chatCompleteJson } from './openai';
import { asStringList, ensureNetworkTables, type NetworkContactRecord } from './network-contacts';
import { rowToCamel } from './case';

export interface VendorAsk {
  isVendorAsk: boolean;
  category: string | null;
  region: string | null;
  summary: string | null;
}

const ASK_HINT = /有人|認識|推薦|廠商|師傅|誰會|想做|可以問|有沒有人|求推薦|介紹一下|會做|能做|包商|施工|拍謝問|請問|我想找|找一個|水電|防水|冷氣|抓漏/;

export function looksLikeVendorAsk(text: string): boolean {
  const t = text.replace(/\s+/g, '');
  if (t.length < 4 || t.length > 400) return false;
  return ASK_HINT.test(t) || /[嗎呢？?]/.test(t) && /(做|修|裝|清|抓漏|防水|冷氣|電梯|排煙|貼膜)/.test(t);
}

export async function classifyVendorAsk(env: Env, text: string): Promise<VendorAsk> {
  if (!looksLikeVendorAsk(text)) {
    return { isVendorAsk: false, category: null, region: null, summary: null };
  }
  const result = await chatCompleteJson<VendorAsk>(env, {
    messages: [
      {
        role: 'system',
        content: '你在判斷台灣修繕群組訊息是否在「求廠商／求推薦」。只回 JSON。' +
          '{"isVendorAsk":true/false,"category":"工種如排煙管/電梯/貼膜/冷氣清洗","region":"縣市或行政區或null","summary":"一句話需求"}',
      },
      { role: 'user', content: text },
    ],
    temperature: 0.1,
    maxTokens: 300,
  });
  return {
    isVendorAsk: result.isVendorAsk !== false,
    category: result.category?.trim() || null,
    region: result.region?.trim() || null,
    summary: result.summary?.trim() || null,
  };
}

export interface RankedContact {
  contact: NetworkContactRecord;
  score: number;
  reasons: string[];
}

export async function searchVendors(
  env: Env,
  brandId: string,
  ask: VendorAsk,
): Promise<RankedContact[]> {
  await ensureNetworkTables(env);
  const sql = getSql(env);
  const category = ask.category?.trim() || '';
  const region = ask.region?.trim() || '';
  const likeCat = category ? `%${category}%` : '%';
  const likeRegion = region ? `%${region}%` : '%';

  const rows = await sql`
    SELECT * FROM network_contacts
    WHERE brand_id = ${brandId}::uuid
      AND status <> 'archived'
      AND (
        ${category} = ''
        OR name ILIKE ${likeCat}
        OR COALESCE(company, '') ILIKE ${likeCat}
        OR COALESCE(industry, '') ILIKE ${likeCat}
        OR COALESCE(notes, '') ILIKE ${likeCat}
        OR specialties::text ILIKE ${likeCat}
        OR COALESCE(title, '') ILIKE ${likeCat}
      )
    ORDER BY updated_at DESC
    LIMIT 40
  `;

  const ranked = (rows as Record<string, unknown>[]).map((row) => {
    const contact = {
      ...rowToCamel<NetworkContactRecord>(row),
      specialties: asStringList((row as { specialties?: unknown }).specialties),
      serviceRegions: asStringList((row as { service_regions?: unknown }).service_regions),
    };
    return scoreContact(contact, category, region);
  }).filter((item) => item.score > 0);

  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, 3);
}

function scoreContact(contact: NetworkContactRecord, category: string, region: string): RankedContact {
  let score = 0;
  const reasons: string[] = [];
  const blob = [contact.name, contact.company, contact.industry, contact.title, contact.notes, ...contact.specialties]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const cat = category.toLowerCase();
  const specHit = contact.specialties.some((s) => category && (s.includes(category) || category.includes(s)));
  if (specHit) {
    score += 4;
    reasons.push(`專長符合「${category}」`);
  } else if (cat && blob.includes(cat)) {
    score += 3;
    reasons.push(`資料提到「${category}」`);
  } else if (cat) {
    const tokens = category.split(/[／/\s、]+/).filter((item) => item.length >= 2);
    if (tokens.some((token) => blob.includes(token.toLowerCase()))) {
      score += 2;
      reasons.push(`資料接近「${category}」`);
    }
  }
  if (region) {
    const regionHit = contact.serviceRegions.some((r) => r.includes(region) || region.includes(r))
      || (contact.address ?? '').includes(region)
      || (contact.notes ?? '').includes(region);
    if (regionHit) {
      score += 2;
      reasons.push(`服務地區含「${region}」`);
    }
  }
  if (contact.acceptsDispatch) {
    score += 1;
    reasons.push('願意承接修繕中心派案');
  }
  if (contact.status === 'verified') score += 1;
  if (contact.phone) score += 0.5;
  return { contact, score, reasons };
}

export async function logNetworkMatch(
  env: Env,
  params: {
    brandId: string;
    queryText: string;
    ask: VendorAsk;
    matches: RankedContact[];
    lineUserId?: string | null;
    lineGroupId?: string | null;
  },
): Promise<void> {
  const sql = getSql(env);
  await sql`
    INSERT INTO network_match_logs (
      brand_id, query_text, category, region, intent, matched_contact_ids, line_user_id, line_group_id
    ) VALUES (
      ${params.brandId}::uuid, ${params.queryText}, ${params.ask.category}, ${params.ask.region},
      ${params.ask.isVendorAsk ? '求廠商' : '其他'},
      ${JSON.stringify(params.matches.map((m) => m.contact.id))}::jsonb,
      ${params.lineUserId ?? null}, ${params.lineGroupId ?? null}
    )
  `;
}

export function formatMatchText(ask: VendorAsk, matches: RankedContact[]): string {
  if (!matches.length) {
    return `目前人脈庫裡還沒找到「${ask.category ?? '這個工種'}」${ask.region ? `／${ask.region}` : ''}的合適名單。我先記下這筆需求。`;
  }
  const lines = matches.map((m, i) => {
    const c = m.contact;
    const bits = [c.company, c.specialties.slice(0, 3).join('、'), c.phone ? `Tel ${c.phone}` : '', c.lineId ? `LINE ${c.lineId}` : '']
      .filter(Boolean);
    return `${i + 1}. ${c.name}${bits.length ? `｜${bits.join('｜')}` : ''}`;
  });
  return `依「${ask.summary ?? ask.category ?? '你的需求'}」找到這幾位，資料供參考，請自行確認是否方便接案：\n${lines.join('\n')}`;
}
