import { useMemo, useState, type CSSProperties } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useBrand } from '@/context/BrandContext';
import { api, ApiError } from '@/lib/api';
import { useAsyncData, LoadingState, ErrorState } from '@/hooks/useAsyncData';
import type { CsKnowledgeDocument, HelpChatResult, HelpRoleOption, HelpTicket, HelpTicketStatus } from '@/types';

type Tab = 'docs' | 'try' | 'tickets' | 'embed';

const TABS: { id: Tab; label: string }[] = [
  { id: 'docs', label: '客服文件' },
  { id: 'try', label: '試問' },
  { id: 'tickets', label: '待追蹤' },
  { id: 'embed', label: '嵌入設定' },
];

const TICKET_STATUS: { id: HelpTicketStatus | ''; label: string }[] = [
  { id: 'new', label: '待聯繫' },
  { id: 'contacted', label: '已聯繫' },
  { id: 'resolved', label: '已結案' },
  { id: 'cancelled', label: '已取消' },
  { id: '', label: '全部' },
];

export function BrandCsKnowledge() {
  const { brand: slug } = useParams();
  const { brandBySlug, brandsLoading } = useBrand();
  const brand = slug ? brandBySlug(slug) : undefined;
  const [tab, setTab] = useState<Tab>('docs');

  const docsQuery = useAsyncData(() => slug ? api.helpDocuments(slug) : Promise.reject(new Error('no slug')), [slug]);
  const settingsQuery = useAsyncData(() => slug ? api.helpSettings(slug) : Promise.reject(new Error('no slug')), [slug]);
  const ticketsQuery = useAsyncData(() => slug ? api.helpTickets(slug) : Promise.reject(new Error('no slug')), [slug]);

  if (!brand) return brandsLoading ? <LoadingState /> : <Navigate to="/" replace />;
  if (docsQuery.loading || settingsQuery.loading || ticketsQuery.loading) return <LoadingState />;
  if (docsQuery.error || settingsQuery.error || ticketsQuery.error || !settingsQuery.data || !docsQuery.data || !ticketsQuery.data) {
    return (
      <ErrorState
        message={docsQuery.error ?? settingsQuery.error ?? ticketsQuery.error ?? '載入失敗'}
        onRetry={() => { docsQuery.reload(); settingsQuery.reload(); ticketsQuery.reload(); }}
      />
    );
  }

  const roles = settingsQuery.data.roles;
  const newCount = ticketsQuery.data.newCount;

  return (
    <div>
      <PageHeader
        title={`${brand.name} 品牌客服資料庫`}
        subtitle="上傳操作說明後，Web／LIFF 小幫手只依文件回答。不連接真實案件。"
        actions={newCount > 0 ? <Badge tone="danger">待聯繫 {newCount}</Badge> : undefined}
      />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {TABS.map((t) => (
          <Button key={t.id} variant={tab === t.id ? 'primary' : 'ghost'} onClick={() => setTab(t.id)}>
            {t.label}{t.id === 'tickets' && newCount > 0 ? ` (${newCount})` : ''}
          </Button>
        ))}
      </div>

      {tab === 'docs' && (
        <DocsTab
          slug={brand.slug}
          roles={roles}
          documents={docsQuery.data.documents}
          onChanged={() => docsQuery.reload()}
        />
      )}
      {tab === 'try' && (
        <TryTab slug={brand.slug} roles={roles} />
      )}
      {tab === 'tickets' && (
        <TicketsTab
          slug={brand.slug}
          roles={roles}
          tickets={ticketsQuery.data.tickets}
          onChanged={() => ticketsQuery.reload()}
        />
      )}
      {tab === 'embed' && (
        <EmbedTab
          slug={brand.slug}
          brandName={brand.name}
          roles={roles}
          settings={settingsQuery.data.settings}
          sessions={settingsQuery.data.sessions}
          onChanged={() => settingsQuery.reload()}
        />
      )}
    </div>
  );
}

function DocsTab({ slug, roles, documents, onChanged }: {
  slug: string;
  roles: HelpRoleOption[];
  documents: CsKnowledgeDocument[];
  onChanged: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [pagePaths, setPagePaths] = useState('');
  const [pickedRoles, setPickedRoles] = useState<string[]>(roles[0] ? [roles[0].id] : []);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState<Record<string, { title: string; text: string; roles: string[]; paths: string }>>({});

  function toggleRole(id: string, list: string[], set: (v: string[]) => void) {
    set(list.includes(id) ? list.filter((r) => r !== id) : [...list, id]);
  }

  async function syncOfficial() {
    setBusy(true); setMessage('');
    try {
      const res = await api.seedHelpDocuments(slug);
      setMessage(`已同步 ${res.upserted.length} 份官方操作文件（新增 ${res.created}、更新 ${res.updated}），並直接發布。`);
      onChanged();
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : '同步失敗');
    } finally {
      setBusy(false);
    }
  }

  async function upload() {
    if (!file || !pickedRoles.length) return;
    setBusy(true); setMessage('');
    try {
      const res = await api.uploadHelpDocument(slug, { file, title: title.trim() || undefined, roles: pickedRoles, pagePaths });
      setMessage(res.extractError ? `已存檔，但抽取失敗：${res.extractError}` : '已上傳並抽出正文，請核對後發布。');
      setFile(null); setTitle('');
      onChanged();
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : '上傳失敗');
    } finally {
      setBusy(false);
    }
  }

  function draftOf(doc: CsKnowledgeDocument) {
    return editing[doc.id] ?? {
      title: doc.title,
      text: doc.extractedText ?? '',
      roles: doc.roles,
      paths: doc.pagePaths.join(', '),
    };
  }

  async function save(doc: CsKnowledgeDocument, publish?: 'published' | 'draft' | 'archived') {
    const d = draftOf(doc);
    setBusy(true); setMessage('');
    try {
      await api.updateHelpDocument(slug, doc.id, {
        title: d.title,
        extractedText: d.text,
        roles: d.roles,
        pagePaths: d.paths.split(/[\n,]/).map((s) => s.trim()).filter(Boolean),
        publishStatus: publish,
      });
      setEditing((prev) => { const next = { ...prev }; delete next[doc.id]; return next; });
      setMessage(publish === 'published' ? '已發布，前台小幫手可以使用。' : publish === 'draft' ? '已下架為草稿。' : '已儲存。');
      onChanged();
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : '儲存失敗');
    } finally {
      setBusy(false);
    }
  }

  async function remove(doc: CsKnowledgeDocument) {
    if (!confirm(`確定刪除「${doc.title}」？原檔紀錄會從資料庫移除。`)) return;
    setBusy(true);
    try {
      await api.deleteHelpDocument(slug, doc.id);
      onChanged();
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : '刪除失敗');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card>
        <strong style={{ display: 'block', marginBottom: 8 }}>上傳客服文件</strong>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 12px' }}>
          接受 MD／TXT／PDF／Word（.docx）。抽出的是操作正文，不會進品牌行銷知識庫。發布後該角色的小幫手才能引用。
        </p>
        {(slug === 'taskgo' || slug === 'homigo') && (
          <div style={{ marginBottom: 12 }}>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => void syncOfficial()}
            >
              {busy ? '同步中…' : slug === 'homigo' ? '同步官方操作文件（21 份）' : '同步官方操作文件（32 份）'}
            </Button>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '6px 0 0' }}>
              {slug === 'homigo'
                ? '依檔名或標題覆蓋房東／房客／代管說明，並直接發布。來源：docs/help/homigo。'
                : '依檔名或標題覆蓋後勤／工班／業主說明，並直接發布。來源：docs/help/taskgo。'}
            </p>
          </div>
        )}
        {message && <p style={{ fontSize: 13, color: 'var(--color-primary-dark)' }}>{message}</p>}
        <div style={{ display: 'grid', gap: 8 }}>
          <input placeholder="標題（選填，空白則用檔名）" value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
          <input type="file" accept=".md,.txt,.pdf,.docx,text/markdown,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <input placeholder="相關畫面路徑（選填，逗號分隔，例如 /liff/repair）" value={pagePaths} onChange={(e) => setPagePaths(e.target.value)} style={inputStyle} />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {roles.map((r) => (
              <label key={r.id} style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="checkbox" checked={pickedRoles.includes(r.id)} onChange={() => toggleRole(r.id, pickedRoles, setPickedRoles)} />
                {r.label}
              </label>
            ))}
          </div>
          <Button variant="primary" disabled={!file || !pickedRoles.length || busy} onClick={() => void upload()} style={{ justifySelf: 'start' }}>
            {busy ? '處理中…' : '+ 上傳並抽出正文'}
          </Button>
        </div>
      </Card>

      {documents.map((doc) => {
        const d = draftOf(doc);
        return (
          <Card key={doc.id}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              <Badge tone={doc.publishStatus === 'published' ? 'success' : 'default'}>
                {doc.publishStatus === 'published' ? '已發布' : doc.publishStatus === 'archived' ? '已封存' : '草稿'}
              </Badge>
              <Badge tone={doc.extractStatus === 'ready' ? 'primary' : doc.extractStatus === 'failed' ? 'danger' : 'accent'}>
                {doc.extractStatus === 'ready' ? '已抽正文' : doc.extractStatus === 'failed' ? '抽取失敗' : '處理中'}
              </Badge>
              {doc.roles.map((r) => <Badge key={r} tone="secondary">{roles.find((x) => x.id === r)?.label ?? r}</Badge>)}
            </div>
            <input value={d.title} onChange={(e) => setEditing((p) => ({ ...p, [doc.id]: { ...d, title: e.target.value } }))} style={{ ...inputStyle, fontWeight: 700, marginBottom: 8 }} />
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
              {roles.map((r) => (
                <label key={r.id} style={{ fontSize: 12, display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input type="checkbox" checked={d.roles.includes(r.id)} onChange={() => {
                    const next = d.roles.includes(r.id) ? d.roles.filter((x) => x !== r.id) : [...d.roles, r.id];
                    setEditing((p) => ({ ...p, [doc.id]: { ...d, roles: next } }));
                  }} />
                  {r.label}
                </label>
              ))}
            </div>
            <input
              placeholder="相關畫面路徑"
              value={d.paths}
              onChange={(e) => setEditing((p) => ({ ...p, [doc.id]: { ...d, paths: e.target.value } }))}
              style={{ ...inputStyle, marginBottom: 8 }}
            />
            <textarea
              value={d.text}
              onChange={(e) => setEditing((p) => ({ ...p, [doc.id]: { ...d, text: e.target.value } }))}
              style={{ ...inputStyle, minHeight: 160, whiteSpace: 'pre-wrap' }}
            />
            {doc.fileUrl && (
              <a href={doc.fileUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, display: 'inline-block', marginTop: 8 }}>
                下載原檔 {doc.fileName}
              </a>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              <Button variant="secondary" disabled={busy} onClick={() => void save(doc)}>儲存草稿</Button>
              {doc.publishStatus !== 'published' && (
                <Button variant="primary" disabled={busy || doc.extractStatus !== 'ready'} onClick={() => void save(doc, 'published')}>發布</Button>
              )}
              {doc.publishStatus === 'published' && (
                <Button variant="ghost" disabled={busy} onClick={() => void save(doc, 'draft')}>下架</Button>
              )}
              <Button variant="danger" disabled={busy} onClick={() => void remove(doc)}>刪除</Button>
            </div>
          </Card>
        );
      })}
      {documents.length === 0 && <Card><p style={{ color: 'var(--color-text-muted)' }}>尚未上傳客服文件。先上傳一份，該角色的小幫手就能開始回答。</p></Card>}
    </div>
  );
}

function TryTab({ slug, roles }: { slug: string; roles: HelpRoleOption[] }) {
  const [role, setRole] = useState(roles[0]?.id ?? '');
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msgs, setMsgs] = useState<{ role: 'user' | 'assistant'; content: string; citations?: { title: string }[]; answered?: boolean }[]>([]);

  async function send(text?: string) {
    const message = (text ?? input).trim();
    if (!message || !role) return;
    setBusy(true); setErr(''); setInput('');
    setMsgs((m) => [...m, { role: 'user', content: message }]);
    try {
      const res: HelpChatResult = await api.helpChat(slug, { role, message, sessionId });
      setSessionId(res.sessionId);
      setMsgs((m) => [...m, { role: 'assistant', content: res.answer, citations: res.citations, answered: res.answered }]);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '試問失敗');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <strong>用已發布文件自測</strong>
        <select value={role} onChange={(e) => { setRole(e.target.value); setSessionId(undefined); setMsgs([]); }} style={inputStyle}>
          {roles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
      </div>
      <div style={{ display: 'grid', gap: 8, minHeight: 240, marginBottom: 12 }}>
        {msgs.length === 0 && <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>只會讀這個角色已發布的客服文件。沒文件時會引導留資，不會編造功能。</p>}
        {msgs.map((m, i) => (
          <div key={i} style={{ ...cardBoxStyle, background: m.role === 'user' ? 'var(--color-primary-soft)' : 'var(--color-bg)' }}>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 4 }}>{m.role === 'user' ? '你' : '小幫手'}</div>
            <div style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>{m.content}</div>
            {!!m.citations?.length && <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 6 }}>依 {m.citations.map((c) => `《${c.title}》`).join('、')}</div>}
          </div>
        ))}
      </div>
      {err && <p style={{ color: '#B85454', fontSize: 13 }}>{err}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void send(); }} placeholder="例如：報修送出後要去哪裡看進度？" style={inputStyle} />
        <Button variant="primary" disabled={busy || !input.trim()} onClick={() => void send()}>{busy ? '…' : '送出'}</Button>
      </div>
    </Card>
  );
}

function TicketsTab({ slug, roles, tickets, onChanged }: {
  slug: string;
  roles: HelpRoleOption[];
  tickets: HelpTicket[];
  onChanged: () => void;
}) {
  const [filter, setFilter] = useState<HelpTicketStatus | ''>('new');
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const shown = useMemo(() => filter ? tickets.filter((t) => t.status === filter) : tickets, [tickets, filter]);

  async function setStatus(id: string, status: HelpTicketStatus) {
    setBusy(true);
    try {
      await api.updateHelpTicket(slug, id, { status, followupNote: note || undefined });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {TICKET_STATUS.map((s) => (
          <Button key={s.id || 'all'} variant={filter === s.id ? 'primary' : 'ghost'} onClick={() => setFilter(s.id)}>
            {s.label}
          </Button>
        ))}
      </div>
      {shown.map((t) => (
        <Card key={t.id} hoverable onClick={() => { setOpenId(openId === t.id ? null : t.id); setNote(t.followupNote ?? ''); }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div>
              <strong>{t.name}</strong>
              <span style={{ marginLeft: 8, fontSize: 13, color: 'var(--color-text-muted)' }}>{t.phone}</span>
            </div>
            <Badge tone={t.status === 'new' ? 'danger' : t.status === 'contacted' ? 'accent' : 'default'}>
              {TICKET_STATUS.find((s) => s.id === t.status)?.label ?? t.status}
            </Badge>
          </div>
          <div style={{ fontSize: 13, marginTop: 6 }}>{t.requestNote}</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>
            {roles.find((r) => r.id === t.role)?.label ?? t.role} · {t.source} · {new Date(t.createdAt).toLocaleString('zh-TW')}
          </div>
          {openId === t.id && (
            <div style={{ marginTop: 12, display: 'grid', gap: 8 }} onClick={(e) => e.stopPropagation()}>
              <div style={{ fontSize: 13 }}>Email：{t.email || '—'}　LINE：{t.lineId || '—'}</div>
              {t.pagePath && <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>頁面 {t.pagePath}</div>}
              {t.transcriptSnapshot.length > 0 && (
                <div style={{ ...cardBoxStyle, fontSize: 12, maxHeight: 180, overflow: 'auto' }}>
                  {t.transcriptSnapshot.map((m, i) => (
                    <div key={i} style={{ marginBottom: 6 }}><b>{m.role === 'user' ? '用戶' : '小幫手'}</b> {m.content}</div>
                  ))}
                </div>
              )}
              <textarea placeholder="內部備註（客戶看不到）" value={note} onChange={(e) => setNote(e.target.value)} style={{ ...inputStyle, minHeight: 72 }} />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button variant="secondary" disabled={busy} onClick={() => void setStatus(t.id, 'contacted')}>已聯繫</Button>
                <Button variant="primary" disabled={busy} onClick={() => void setStatus(t.id, 'resolved')}>已結案</Button>
                <Button variant="ghost" disabled={busy} onClick={() => void setStatus(t.id, 'cancelled')}>取消</Button>
                <Button variant="ghost" disabled={busy} onClick={() => void setStatus(t.id, 'new')}>回到待聯繫</Button>
              </div>
            </div>
          )}
        </Card>
      ))}
      {shown.length === 0 && <Card><p style={{ color: 'var(--color-text-muted)' }}>這個篩選目前沒有工單。</p></Card>}
    </div>
  );
}

function EmbedTab({ slug, brandName, roles, settings, sessions, onChanged }: {
  slug: string;
  brandName: string;
  roles: HelpRoleOption[];
  settings: { widgetKey: string; welcomeByRole: Record<string, string>; origins: string[] };
  sessions: { id: string; role: string; pagePath: string | null; source: string; createdAt: string; preview: string }[];
  onChanged: () => void;
}) {
  const [origins, setOrigins] = useState(settings.origins.join('\n'));
  const [welcome, setWelcome] = useState<Record<string, string>>(settings.welcomeByRole);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const host = typeof window !== 'undefined' ? window.location.origin : '';
  const snippet = `<script src="${host}/api/public/help/widget" data-brand="${slug}" data-role="${roles[0]?.id ?? 'user'}" data-key="${settings.widgetKey}" data-page-path="/"></script>`;

  async function save(rotate = false) {
    setBusy(true); setMsg('');
    try {
      await api.updateHelpSettings(slug, {
        origins: origins.split(/\n/).map((s) => s.trim()).filter(Boolean),
        welcomeByRole: welcome,
        rotateKey: rotate,
      });
      setMsg(rotate ? '已更換 widget key，請更新產品系統的 script。' : '已儲存嵌入設定。');
      onChanged();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : '儲存失敗');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card>
        <strong style={{ display: 'block', marginBottom: 8 }}>嵌入產品系統</strong>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          把這段放到 {brandName} Web 或 LIFF。LIFF 請加 <code>data-source="liff"</code>，並依頁面改 <code>data-role</code> 與 <code>data-page-path</code>。
        </p>
        <textarea readOnly value={snippet} style={{ ...inputStyle, minHeight: 90, fontFamily: 'ui-monospace, monospace', fontSize: 12 }} />
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>白名單留空 = 不限制來源。建議至少加上產品網域與 https://liff.line.me</p>
        <textarea value={origins} onChange={(e) => setOrigins(e.target.value)} placeholder={'https://app.taskgo.com.tw\nhttps://liff.line.me'} style={{ ...inputStyle, minHeight: 90 }} />
        {roles.map((r) => (
          <div key={r.id} style={{ marginTop: 8 }}>
            <div style={{ fontSize: 12, marginBottom: 4 }}>{r.label} 歡迎句</div>
            <input value={welcome[r.id] ?? ''} onChange={(e) => setWelcome((w) => ({ ...w, [r.id]: e.target.value }))} placeholder={`${r.label} 專用招呼`} style={inputStyle} />
          </div>
        ))}
        {msg && <p style={{ fontSize: 13 }}>{msg}</p>}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <Button variant="primary" disabled={busy} onClick={() => void save(false)}>儲存</Button>
          <Button variant="ghost" disabled={busy} onClick={() => void save(true)}>更換 widget key</Button>
          <Button variant="secondary" onClick={() => {
            document.getElementById('go-help-widget')?.remove();
            document.querySelectorAll('script[data-go-help]').forEach((n) => n.remove());
            const s = document.createElement('script');
            s.src = `${host}/api/public/help/widget`;
            s.setAttribute('data-go-help', '1');
            s.setAttribute('data-brand', slug);
            s.setAttribute('data-role', roles[0]?.id ?? 'user');
            s.setAttribute('data-key', settings.widgetKey);
            s.setAttribute('data-page-path', `/${slug}/help`);
            document.body.appendChild(s);
          }}>在本頁預覽小幫手</Button>
        </div>
      </Card>
      <Card>
        <strong style={{ display: 'block', marginBottom: 8 }}>最近對話</strong>
        {sessions.length === 0 && <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>還沒有前台對話。</p>}
        {sessions.map((s) => (
          <div key={s.id} style={{ padding: '8px 0', borderTop: '1px solid var(--color-border)', fontSize: 13 }}>
            <div style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>
              {roles.find((r) => r.id === s.role)?.label ?? s.role} · {s.source} · {new Date(s.createdAt).toLocaleString('zh-TW')}
            </div>
            {s.preview || '（尚無提問）'}
          </div>
        ))}
      </Card>
    </div>
  );
}

const cardBoxStyle: CSSProperties = {
  border: '1px solid var(--color-border)', borderRadius: 10, padding: 14, background: 'var(--color-bg)',
};

const inputStyle: CSSProperties = {
  width: '100%', padding: '7px 12px', borderRadius: 8, border: '1px solid var(--color-border)',
  fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box',
};
