import type { Env } from './env';
import { getSql } from './db';
import { rowToCamel } from './case';
import { chatCompleteJson, toClientError } from './openai';
import { generateToken } from './token';
import { isMissingProductHelp, applyProductHelpMigration } from './product-help-migrate';

export const HELP_ROLES_BY_BRAND: Record<string, { id: string; label: string }[]> = {
  homigo: [
    { id: 'landlord', label: '房東' },
    { id: 'tenant', label: '房客' },
    { id: 'manager', label: '代管' },
  ],
  taskgo: [
    { id: 'office', label: '後勤' },
    { id: 'crew', label: '工班' },
    { id: 'client', label: '業主' },
  ],
  washgo: [
    { id: 'customer', label: '送洗客戶' },
    { id: 'staff', label: '門市員工' },
    { id: 'driver', label: '司機' },
  ],
};

export function rolesForBrand(slug: string): { id: string; label: string }[] {
  return HELP_ROLES_BY_BRAND[slug] ?? [{ id: 'user', label: '使用者' }];
}

export function isValidHelpRole(slug: string, role: string): boolean {
  return rolesForBrand(slug).some((r) => r.id === role);
}

export function roleLabel(slug: string, role: string): string {
  return rolesForBrand(slug).find((r) => r.id === role)?.label ?? role;
}

export function defaultWelcome(brandName: string, roleLabelText: string): string {
  return `嗨，我是 ${brandName} 小幫手。你現在是「${roleLabelText}」視角，可以問系統怎麼操作。文件沒寫的事我會說實話，也可以請真人客服聯繫你。`;
}

export type HelpSource = 'web' | 'liff' | 'admin';
export type TicketStatus = 'new' | 'contacted' | 'resolved' | 'cancelled';
export type ExtractStatus = 'pending' | 'ready' | 'failed';
export type PublishStatus = 'draft' | 'published' | 'archived';

export interface CsDocument {
  id: string;
  brandId: string;
  title: string;
  fileUrl: string | null;
  fileName: string | null;
  mimeType: string | null;
  extractedText: string | null;
  extractStatus: ExtractStatus;
  publishStatus: PublishStatus;
  pagePaths: string[];
  roles: string[];
  uploadedBy: string | null;
  publishedBy: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface HelpCitation {
  title: string;
}

export interface HelpChatResult {
  sessionId: string;
  answer: string;
  answered: boolean;
  citations: HelpCitation[];
  suggestedFollowups: string[];
}

export interface HelpTicket {
  id: string;
  brandId: string;
  sessionId: string | null;
  role: string | null;
  pagePath: string | null;
  source: HelpSource;
  name: string;
  phone: string;
  email: string | null;
  lineId: string | null;
  requestNote: string;
  transcriptSnapshot: { role: string; content: string }[];
  status: TicketStatus;
  followupNote: string | null;
  contactedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface HelpSettings {
  brandId: string;
  widgetKey: string;
  welcomeByRole: Record<string, string>;
  origins: string[];
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string' && !!v.trim());
  return [];
}

function toDocument(row: Record<string, unknown>, roles: string[] = []): CsDocument {
  const camel = rowToCamel<Record<string, unknown>>(row);
  const extract = camel.extractStatus === 'ready' || camel.extractStatus === 'failed' ? camel.extractStatus : 'pending';
  const publish = camel.publishStatus === 'published' || camel.publishStatus === 'archived' ? camel.publishStatus : 'draft';
  return {
    id: String(camel.id),
    brandId: String(camel.brandId),
    title: String(camel.title ?? ''),
    fileUrl: typeof camel.fileUrl === 'string' ? camel.fileUrl : null,
    fileName: typeof camel.fileName === 'string' ? camel.fileName : null,
    mimeType: typeof camel.mimeType === 'string' ? camel.mimeType : null,
    extractedText: typeof camel.extractedText === 'string' ? camel.extractedText : null,
    extractStatus: extract,
    publishStatus: publish,
    pagePaths: asStringArray(camel.pagePaths),
    roles,
    uploadedBy: typeof camel.uploadedBy === 'string' ? camel.uploadedBy : null,
    publishedBy: typeof camel.publishedBy === 'string' ? camel.publishedBy : null,
    publishedAt: typeof camel.publishedAt === 'string' ? camel.publishedAt : null,
    createdAt: String(camel.createdAt ?? ''),
    updatedAt: typeof camel.updatedAt === 'string' ? camel.updatedAt : undefined,
  };
}

function toTicket(row: Record<string, unknown>): HelpTicket {
  const camel = rowToCamel<Record<string, unknown>>(row);
  const snap = Array.isArray(camel.transcriptSnapshot) ? camel.transcriptSnapshot : [];
  const status = ['new', 'contacted', 'resolved', 'cancelled'].includes(String(camel.status))
    ? String(camel.status) as TicketStatus
    : 'new';
  const source = camel.source === 'liff' || camel.source === 'admin' ? camel.source : 'web';
  return {
    id: String(camel.id),
    brandId: String(camel.brandId),
    sessionId: typeof camel.sessionId === 'string' ? camel.sessionId : null,
    role: typeof camel.role === 'string' ? camel.role : null,
    pagePath: typeof camel.pagePath === 'string' ? camel.pagePath : null,
    source,
    name: String(camel.name ?? ''),
    phone: String(camel.phone ?? ''),
    email: typeof camel.email === 'string' ? camel.email : null,
    lineId: typeof camel.lineId === 'string' ? camel.lineId : null,
    requestNote: String(camel.requestNote ?? ''),
    transcriptSnapshot: snap
      .filter((m): m is { role: string; content: string } => !!m && typeof m === 'object')
      .map((m) => ({ role: String((m as { role?: string }).role ?? ''), content: String((m as { content?: string }).content ?? '') })),
    status,
    followupNote: typeof camel.followupNote === 'string' ? camel.followupNote : null,
    contactedAt: typeof camel.contactedAt === 'string' ? camel.contactedAt : null,
    resolvedAt: typeof camel.resolvedAt === 'string' ? camel.resolvedAt : null,
    createdAt: String(camel.createdAt ?? ''),
    updatedAt: typeof camel.updatedAt === 'string' ? camel.updatedAt : undefined,
  };
}

export async function withProductHelp<T>(env: Env, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    if (!isMissingProductHelp(e)) throw e;
    await applyProductHelpMigration(env);
    return run();
  }
}

export async function listCsDocuments(env: Env, brandId: string): Promise<CsDocument[]> {
  return withProductHelp(env, async () => {
    const sql = getSql(env);
    const rows = await sql`
      SELECT * FROM cs_knowledge_documents
      WHERE brand_id = ${brandId}::uuid
      ORDER BY created_at DESC
    `;
    const docs = (rows as Record<string, unknown>[]).map((r) => toDocument(r));
    if (!docs.length) return [];
    const roleRows = await sql`
      SELECT r.document_id, r.role
      FROM cs_knowledge_document_roles r
      JOIN cs_knowledge_documents d ON d.id = r.document_id
      WHERE d.brand_id = ${brandId}::uuid
    `;
    const byDoc = new Map<string, string[]>();
    for (const row of roleRows as { document_id: string; role: string }[]) {
      const list = byDoc.get(row.document_id) ?? [];
      list.push(row.role);
      byDoc.set(row.document_id, list);
    }
    return docs.map((d) => ({ ...d, roles: byDoc.get(d.id) ?? [] }));
  });
}

export async function getCsDocument(env: Env, brandId: string, id: string): Promise<CsDocument | null> {
  const docs = await listCsDocuments(env, brandId);
  return docs.find((d) => d.id === id) ?? null;
}

export async function replaceDocumentRoles(env: Env, documentId: string, roles: string[]): Promise<void> {
  const sql = getSql(env);
  await sql`DELETE FROM cs_knowledge_document_roles WHERE document_id = ${documentId}::uuid`;
  const unique = [...new Set(roles.map((r) => r.trim()).filter(Boolean))];
  for (const role of unique) {
    await sql`
      INSERT INTO cs_knowledge_document_roles (document_id, role)
      VALUES (${documentId}::uuid, ${role})
    `;
  }
}

export async function loadPublishedDocsForRole(env: Env, brandId: string, role: string): Promise<CsDocument[]> {
  return withProductHelp(env, async () => {
    const sql = getSql(env);
    const rows = await sql`
      SELECT d.* FROM cs_knowledge_documents d
      JOIN cs_knowledge_document_roles r ON r.document_id = d.id
      WHERE d.brand_id = ${brandId}::uuid
        AND d.publish_status = 'published'
        AND d.extract_status = 'ready'
        AND r.role = ${role}
      ORDER BY d.updated_at DESC
    `;
    return (rows as Record<string, unknown>[]).map((r) => toDocument(r, [role]));
  });
}

function tokenize(q: string): string[] {
  return q
    .toLowerCase()
    .split(/[^\u4e00-\u9fffa-z0-9]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .slice(0, 12);
}

export function scoreDocument(doc: CsDocument, query: string, pagePath?: string | null): number {
  const tokens = tokenize(query);
  const blob = `${doc.title}\n${doc.extractedText ?? ''}`.toLowerCase();
  let score = 0;
  if (pagePath) {
    const path = pagePath.toLowerCase();
    if (doc.pagePaths.some((p) => path.includes(p.toLowerCase()) || p.toLowerCase().includes(path))) score += 6;
  }
  for (const t of tokens) {
    if (doc.title.toLowerCase().includes(t)) score += 3;
    if (blob.includes(t)) score += 1;
  }
  return score;
}

export function suggestedQuestions(docs: CsDocument[], limit = 5): string[] {
  const out: string[] = [];
  for (const doc of docs) {
    const text = doc.extractedText ?? '';
    const headings = [...text.matchAll(/^#{1,3}\s+(.+)$/gm)].map((m) => m[1].trim());
    for (const h of headings) {
      if (h.length < 4 || h.length > 40) continue;
      if (!out.includes(h)) out.push(h);
      if (out.length >= limit) return out;
    }
    if (doc.title && !out.includes(doc.title) && out.length < limit) out.push(doc.title);
  }
  return out.slice(0, limit);
}

function pickDocs(docs: CsDocument[], query: string, pagePath?: string | null, limit = 3): CsDocument[] {
  if (!docs.length) return [];
  const ranked = docs
    .map((d) => ({ d, s: scoreDocument(d, query, pagePath) }))
    .sort((a, b) => b.s - a.s);
  const picked = ranked.filter((x) => x.s > 0).slice(0, limit).map((x) => x.d);
  return picked.length ? picked : docs.slice(0, Math.min(limit, docs.length));
}

function clipDoc(doc: CsDocument, max = 5000): string {
  const body = (doc.extractedText ?? '').slice(0, max);
  const paths = doc.pagePaths.length ? `相關畫面:${doc.pagePaths.join(', ')}` : '';
  return `【${doc.title}】\n${paths}\n${body}`.trim();
}

export async function answerFromDocs(env: Env, params: {
  brandName: string;
  roleLabel: string;
  question: string;
  pagePath?: string | null;
  history: { role: string; content: string }[];
  docs: CsDocument[];
}): Promise<{ answer: string; answered: boolean; citations: HelpCitation[]; suggestedFollowups: string[] }> {
  if (!params.docs.length) {
    return {
      answer: `這題我還沒有「${params.roleLabel}」的說明文件。請改問操作步驟，或點「請客服聯繫我」留下聯絡方式。`,
      answered: false,
      citations: [],
      suggestedFollowups: [],
    };
  }

  const picked = pickDocs(params.docs, params.question, params.pagePath);
  const context = picked.map((d) => clipDoc(d)).join('\n\n----\n\n');
  const historyLines = params.history.slice(-8).map((m) => `${m.role === 'user' ? '使用者' : '小幫手'}: ${m.content}`).join('\n');

  const result = await chatCompleteJson<{
    answer?: string;
    answered?: boolean;
    citations?: { title?: string }[];
    suggestedFollowups?: string[];
  }>(env, {
    temperature: 0.2,
    maxTokens: 900,
    messages: [
      {
        role: 'system',
        content: [
          `你是 ${params.brandName} 系統操作小幫手，服務對象是「${params.roleLabel}」。`,
          '只用下面提供的客服文件回答「怎麼操作」。繁中、口語、步驟化。',
          '文件沒寫的功能、時效、金額、案件進度一律不准發明。',
          '不准查詢或假裝知道任何真實案件、合約、訂單、客戶資料。',
          '沒依據時 answered=false，並建議請客服聯繫。',
          '回傳 JSON:{"answer":"...","answered":true,"citations":[{"title":"文件標題"}],"suggestedFollowups":["後續可問"]}',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          params.pagePath ? `使用者目前頁面:${params.pagePath}` : '',
          historyLines ? `最近對話:\n${historyLines}` : '',
          `問題:${params.question}`,
          '',
          '可引用的客服文件:',
          context,
        ].filter(Boolean).join('\n'),
      },
    ],
  });

  const citations = (result.citations ?? [])
    .map((c) => (c.title ?? '').trim())
    .filter(Boolean)
    .map((title) => ({ title }));
  const known = new Set(picked.map((d) => d.title));
  const safeCitations = citations.filter((c) => known.has(c.title));
  return {
    answer: (result.answer ?? '').trim() || '我沒有足夠的文件依據回答這題，請點「請客服聯繫我」。',
    answered: result.answered === true,
    citations: safeCitations.length ? safeCitations : (result.answered ? picked.slice(0, 2).map((d) => ({ title: d.title })) : []),
    suggestedFollowups: (result.suggestedFollowups ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 4),
  };
}

export function mapChatError(err: unknown): { status: number; message: string } {
  const mapped = toClientError(err, '回答');
  return { status: mapped.status, message: mapped.message };
}

export async function ensureSettings(env: Env, brandId: string): Promise<HelpSettings> {
  return withProductHelp(env, async () => {
    const sql = getSql(env);
    let rows = await sql`SELECT * FROM product_help_settings WHERE brand_id = ${brandId}::uuid LIMIT 1`;
    if (!rows.length) {
      const key = generateToken(16);
      rows = await sql`
        INSERT INTO product_help_settings (brand_id, widget_key)
        VALUES (${brandId}::uuid, ${key})
        ON CONFLICT (brand_id) DO UPDATE SET brand_id = EXCLUDED.brand_id
        RETURNING *
      `;
    }
    const camel = rowToCamel<Record<string, unknown>>(rows[0] as Record<string, unknown>);
    const originRows = await sql`SELECT origin FROM product_help_origins WHERE brand_id = ${brandId}::uuid ORDER BY origin`;
    const welcome = camel.welcomeByRole && typeof camel.welcomeByRole === 'object' && !Array.isArray(camel.welcomeByRole)
      ? camel.welcomeByRole as Record<string, string>
      : {};
    return {
      brandId,
      widgetKey: String(camel.widgetKey),
      welcomeByRole: welcome,
      origins: (originRows as { origin: string }[]).map((r) => r.origin),
    };
  });
}

export async function saveSettings(env: Env, brandId: string, patch: {
  welcomeByRole?: Record<string, string>;
  origins?: string[];
  rotateKey?: boolean;
}): Promise<HelpSettings> {
  return withProductHelp(env, async () => {
    const current = await ensureSettings(env, brandId);
    const sql = getSql(env);
    const key = patch.rotateKey ? generateToken(16) : current.widgetKey;
    const welcome = patch.welcomeByRole ?? current.welcomeByRole;
    await sql`
      UPDATE product_help_settings
      SET widget_key = ${key}, welcome_by_role = ${JSON.stringify(welcome)}::jsonb
      WHERE brand_id = ${brandId}::uuid
    `;
    if (patch.origins) {
      await sql`DELETE FROM product_help_origins WHERE brand_id = ${brandId}::uuid`;
      const unique = [...new Set(patch.origins.map((o) => normalizeOrigin(o)).filter(Boolean))];
      for (const origin of unique) {
        await sql`
          INSERT INTO product_help_origins (brand_id, origin)
          VALUES (${brandId}::uuid, ${origin})
          ON CONFLICT (brand_id, origin) DO NOTHING
        `;
      }
    }
    return ensureSettings(env, brandId);
  });
}

export function normalizeOrigin(raw: string): string {
  const trimmed = raw.trim().replace(/\/$/, '');
  if (!trimmed) return '';
  try {
    const url = trimmed.includes('://') ? new URL(trimmed) : new URL(`https://${trimmed}`);
    return url.origin;
  } catch {
    return trimmed;
  }
}

export function requestOrigin(request: Request): string | null {
  const header = request.headers.get('Origin');
  if (header) return normalizeOrigin(header);
  const referer = request.headers.get('Referer');
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

export function originAllowed(settings: HelpSettings, origin: string | null, extras: string[] = []): boolean {
  if (!origin) return true;
  if (!settings.origins.length) return true;
  if (settings.origins.includes(origin)) return true;
  return extras.some((extra) => extra && normalizeOrigin(extra) === origin);
}

export function requestHostOrigin(request: Request, env?: Env): string[] {
  const extras: string[] = [];
  try {
    extras.push(new URL(request.url).origin);
  } catch { /* ignore */ }
  if (env?.PUBLIC_BASE_URL) extras.push(env.PUBLIC_BASE_URL);
  return extras;
}

export function corsHeaders(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Help-Key',
    'Vary': 'Origin',
  };
}

export async function clientHash(ip: string, widgetKey: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${ip}|${widgetKey}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

export function clientIp(request: Request): string {
  return request.headers.get('CF-Connecting-IP')
    || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim()
    || 'unknown';
}

export async function assertChatRate(env: Env, hash: string): Promise<string | null> {
  const sql = getSql(env);
  const rows = await sql`
    SELECT COUNT(*)::int AS n
    FROM product_help_messages m
    JOIN product_help_sessions s ON s.id = m.session_id
    WHERE s.client_hash = ${hash}
      AND m.role = 'user'
      AND m.created_at > NOW() - INTERVAL '1 minute'
  `;
  const n = Number((rows[0] as { n: number }).n ?? 0);
  return n >= 10 ? '提問太頻繁，請稍後再試' : null;
}

export async function assertTicketRate(env: Env, hash: string): Promise<string | null> {
  const sql = getSql(env);
  const rows = await sql`
    SELECT COUNT(*)::int AS n
    FROM product_help_tickets
    WHERE client_hash = ${hash}
      AND created_at > NOW() - INTERVAL '10 minutes'
  `;
  const n = Number((rows[0] as { n: number }).n ?? 0);
  return n >= 3 ? '剛才已送出聯繫需求，請稍候客服處理' : null;
}

export async function getOrCreateSession(env: Env, params: {
  sessionId?: string | null;
  brandId: string;
  role: string;
  pagePath?: string | null;
  source: HelpSource;
  widgetKey?: string | null;
  clientHash?: string | null;
}): Promise<string> {
  const sql = getSql(env);
  if (params.sessionId) {
    const existing = await sql`
      SELECT id FROM product_help_sessions
      WHERE id = ${params.sessionId}::uuid AND brand_id = ${params.brandId}::uuid
      LIMIT 1
    `;
    if (existing.length) return (existing[0] as { id: string }).id;
  }
  const rows = await sql`
    INSERT INTO product_help_sessions (brand_id, role, page_path, source, widget_key, client_hash)
    VALUES (
      ${params.brandId}::uuid, ${params.role}, ${params.pagePath ?? null},
      ${params.source}, ${params.widgetKey ?? null}, ${params.clientHash ?? null}
    )
    RETURNING id
  `;
  return (rows[0] as { id: string }).id;
}

export async function loadSessionMessages(env: Env, sessionId: string, limit = 16): Promise<{ role: string; content: string }[]> {
  const sql = getSql(env);
  const rows = await sql`
    SELECT role, content FROM product_help_messages
    WHERE session_id = ${sessionId}::uuid
    ORDER BY created_at ASC
    LIMIT ${limit}
  `;
  return (rows as { role: string; content: string }[]).map((r) => ({ role: r.role, content: r.content }));
}

export async function appendMessage(env: Env, params: {
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  answered?: boolean | null;
  citations?: HelpCitation[];
}): Promise<void> {
  const sql = getSql(env);
  await sql`
    INSERT INTO product_help_messages (session_id, role, content, answered, citations)
    VALUES (
      ${params.sessionId}::uuid, ${params.role}, ${params.content},
      ${params.answered ?? null}, ${JSON.stringify(params.citations ?? [])}::jsonb
    )
  `;
}

export async function listTickets(env: Env, brandId: string, status?: string): Promise<HelpTicket[]> {
  return withProductHelp(env, async () => {
    const sql = getSql(env);
    const rows = status
      ? await sql`
          SELECT * FROM product_help_tickets
          WHERE brand_id = ${brandId}::uuid AND status = ${status}
          ORDER BY created_at DESC LIMIT 200
        `
      : await sql`
          SELECT * FROM product_help_tickets
          WHERE brand_id = ${brandId}::uuid
          ORDER BY created_at DESC LIMIT 200
        `;
    return (rows as Record<string, unknown>[]).map(toTicket);
  });
}

export async function countNewTickets(env: Env, brandId: string): Promise<number> {
  return withProductHelp(env, async () => {
    const sql = getSql(env);
    const rows = await sql`
      SELECT COUNT(*)::int AS n FROM product_help_tickets
      WHERE brand_id = ${brandId}::uuid AND status = 'new'
    `;
    return Number((rows[0] as { n: number }).n ?? 0);
  });
}

export async function createTicket(env: Env, params: {
  brandId: string;
  sessionId?: string | null;
  role?: string | null;
  pagePath?: string | null;
  source: HelpSource;
  name: string;
  phone: string;
  email?: string | null;
  lineId?: string | null;
  requestNote: string;
  clientHash?: string | null;
}): Promise<HelpTicket> {
  return withProductHelp(env, async () => {
    const sql = getSql(env);
    if (params.sessionId) {
      const dup = await sql`
        SELECT id FROM product_help_tickets
        WHERE session_id = ${params.sessionId}::uuid
          AND created_at > NOW() - INTERVAL '10 minutes'
        LIMIT 1
      `;
      if (dup.length) {
        const existing = await sql`SELECT * FROM product_help_tickets WHERE id = ${(dup[0] as { id: string }).id}::uuid`;
        return toTicket(existing[0] as Record<string, unknown>);
      }
    }
    const transcript = params.sessionId ? await loadSessionMessages(env, params.sessionId, 20) : [];
    const rows = await sql`
      INSERT INTO product_help_tickets (
        brand_id, session_id, role, page_path, source,
        name, phone, email, line_id, request_note,
        transcript_snapshot, client_hash
      ) VALUES (
        ${params.brandId}::uuid, ${params.sessionId ?? null}, ${params.role ?? null},
        ${params.pagePath ?? null}, ${params.source},
        ${params.name}, ${params.phone}, ${params.email ?? null}, ${params.lineId ?? null},
        ${params.requestNote}, ${JSON.stringify(transcript)}::jsonb, ${params.clientHash ?? null}
      )
      RETURNING *
    `;
    return toTicket(rows[0] as Record<string, unknown>);
  });
}

export async function updateTicket(env: Env, brandId: string, id: string, patch: {
  status?: TicketStatus;
  followupNote?: string | null;
  assignedTo?: string | null;
}): Promise<HelpTicket | null> {
  return withProductHelp(env, async () => {
    const sql = getSql(env);
    const current = await sql`
      SELECT * FROM product_help_tickets WHERE id = ${id}::uuid AND brand_id = ${brandId}::uuid LIMIT 1
    `;
    if (!current.length) return null;
    const prev = toTicket(current[0] as Record<string, unknown>);
    const status = patch.status ?? prev.status;
    const followup = patch.followupNote !== undefined ? patch.followupNote : prev.followupNote;
    const contactedAt = status === 'contacted' && !prev.contactedAt ? new Date().toISOString() : prev.contactedAt;
    const resolvedAt = (status === 'resolved' || status === 'cancelled') && !prev.resolvedAt
      ? new Date().toISOString()
      : (status === 'new' ? null : prev.resolvedAt);
    const rows = await sql`
      UPDATE product_help_tickets SET
        status = ${status},
        followup_note = ${followup},
        assigned_to = ${patch.assignedTo ?? null},
        contacted_at = ${contactedAt},
        resolved_at = ${resolvedAt}
      WHERE id = ${id}::uuid AND brand_id = ${brandId}::uuid
      RETURNING *
    `;
    return toTicket(rows[0] as Record<string, unknown>);
  });
}

export async function listRecentSessions(env: Env, brandId: string, limit = 40): Promise<{
  id: string;
  role: string;
  pagePath: string | null;
  source: string;
  createdAt: string;
  preview: string;
}[]> {
  return withProductHelp(env, async () => {
    const sql = getSql(env);
    const rows = await sql`
      SELECT s.id, s.role, s.page_path, s.source, s.created_at,
             COALESCE((
               SELECT m.content FROM product_help_messages m
               WHERE m.session_id = s.id AND m.role = 'user'
               ORDER BY m.created_at DESC LIMIT 1
             ), '') AS preview
      FROM product_help_sessions s
      WHERE s.brand_id = ${brandId}::uuid AND s.source <> 'admin'
      ORDER BY s.created_at DESC
      LIMIT ${limit}
    `;
    return (rows as Record<string, unknown>[]).map((r) => {
      const camel = rowToCamel<Record<string, unknown>>(r);
      return {
        id: String(camel.id),
        role: String(camel.role ?? ''),
        pagePath: typeof camel.pagePath === 'string' ? camel.pagePath : null,
        source: String(camel.source ?? 'web'),
        createdAt: String(camel.createdAt ?? ''),
        preview: String(camel.preview ?? ''),
      };
    });
  });
}

export function isValidContactPhone(phone: string): boolean {
  const n = phone.replace(/[\s-]/g, '');
  if (/^09\d{8}$/.test(n)) return true;
  if (/^0\d{7,11}$/.test(n)) return true;
  if (/^\+886\d{8,10}$/.test(n)) return true;
  return false;
}

export function parsePagePaths(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((v) => String(v).trim()).filter(Boolean).slice(0, 12);
  if (typeof raw === 'string') {
    return raw.split(/[\n,]/).map((s) => s.trim()).filter(Boolean).slice(0, 12);
  }
  return [];
}
