import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Tabs';
import { useAuth } from '@/context/AuthContext';
import { useBrand } from '@/context/BrandContext';
import { api, ApiError } from '@/lib/api';

type ClientId = 'chatgpt' | 'claude' | 'grok' | 'gemini';

interface McpKey {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

const CLIENTS: { id: ClientId; label: string; title: string; steps: string[] }[] = [
  {
    id: 'chatgpt',
    label: 'ChatGPT',
    title: '用 ChatGPT 查 Go Marketing',
    steps: [
      '依上方按鈕產生金鑰並複製。',
      '在 ChatGPT 啟用開發者模式後新增 MCP 連接器，網址貼下方 MCP 網址。也可以先把貼上用語送進對話。',
      '機器人確認連接器時，標頭用 x-api-key，值貼上 API Key。',
      '接上後可問接下來要發什麼、發文成效，或把圖片存進素材庫。要排程或發出時，直接說出來即可。',
    ],
  },
  {
    id: 'claude',
    label: 'Claude',
    title: '用 Claude 查 Go Marketing',
    steps: [
      '依上方按鈕產生金鑰並複製。',
      '打開 Claude 的連接器，新增自訂連接器，網址貼下方 MCP 網址。若它要一段說明，貼上下方的話。',
      '機器人確認連接器時，標頭用 x-api-key，值貼上 API Key。',
      '接上後可問接下來要發什麼、發文成效，或把圖片存進素材庫。要排程或發出時，直接說出來即可。',
    ],
  },
  {
    id: 'grok',
    label: 'Grok',
    title: '用 Grok 查 Go Marketing',
    steps: [
      '依上方按鈕產生金鑰並複製。',
      '打開 Grok Bot 對話，貼上下方這段話送出。',
      '機器人確認連接器時，標頭用 x-api-key，值貼上 API Key。',
      '接上後可問接下來要發什麼、發文成效，或把圖片存進素材庫。要排程或發出時，直接說出來即可。',
    ],
  },
  {
    id: 'gemini',
    label: 'Gemini',
    title: '用 Gemini 查 Go Marketing',
    steps: [
      '依上方按鈕產生金鑰並複製。',
      '在 Gemini 的擴充設定加入 MCP 伺服器，網址貼下方 MCP 網址。或把貼上用語送進對話。',
      '機器人確認連接器時，標頭用 x-api-key，值貼上 API Key。',
      '接上後可問接下來要發什麼、發文成效，或把圖片存進素材庫。要排程或發出時，直接說出來即可。',
    ],
  },
];

function mcpUrl() {
  return `${window.location.origin}/mcp`;
}

function singleBrandPrompt(brand: { name: string; slug: string } | null) {
  const focus = brand
    ? `你只負責${brand.name}（${brand.slug}）。`
    : '請先在左上角選定一個品牌，再複製這段話。';
  return [
    `加入這個 MCP 伺服器：${mcpUrl()}`,
    '請用標頭 x-api-key 帶我的 Go Marketing API Key。連線後用繁體中文，只根據 Go Marketing 資料回答，不要編造數字。',
    focus,
    '可查接下來要發的行程、發文成效、市場情報，也可以討論想法。我傳圖片時，呼叫 save_image_asset 存進這個品牌的素材庫；要掛到已經排好的貼文，呼叫 attach_post_image。影片先呼叫 create_video_upload 拿上傳網址。',
    '只有我明確說要發或排程時，才可以呼叫 schedule_post 且 mode 設為 publish。沒說發之前，最多產待審草稿。',
  ].join('\n');
}

function portfolioPrompt() {
  return [
    `加入這個 MCP 伺服器：${mcpUrl()}`,
    '請用標頭 x-api-key 帶我的 Go Marketing API Key。連線後用繁體中文，只根據 Go Marketing 資料回答，不要編造數字。',
    '你是 TaskGo、Homigo、Washgo 的總和助理。用 get_portfolio 看三個品牌的行程、待審、近 7 日成效與下一檔。和居家居不在這份總覽裡。',
    '寫入、產稿、存素材時必須指名 brand，只能是 taskgo、homigo 或 washgo。把圖掛到已排好的貼文用 attach_post_image。',
    '只有我明確說要發或排程，而且指名品牌時，才可以呼叫 schedule_post 且 mode 設為 publish。',
  ].join('\n');
}

function when(value: string | null) {
  if (!value) return '尚未使用';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
}

export function McpConnect() {
  const { user } = useAuth();
  const { currentBrand } = useBrand();
  const [client, setClient] = useState<ClientId>('grok');
  const [keys, setKeys] = useState<McpKey[]>([]);
  const [name, setName] = useState('我的連接器');
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const active = CLIENTS.find((item) => item.id === client) ?? CLIENTS[2];
  const url = typeof window === 'undefined' ? '/mcp' : mcpUrl();

  useEffect(() => {
    let cancelled = false;
    api.mcpKeys()
      .then((data) => { if (!cancelled) setKeys(data.keys); })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof ApiError ? e.message : '金鑰列表載入失敗'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function copy(id: string, text: string) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        throw new Error('no clipboard');
      }
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.left = '-9999px';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      if (!ok) {
        setError('複製失敗，請手動選取文字');
        return;
      }
    }
    setError('');
    setCopied(id);
    window.setTimeout(() => setCopied((current) => (current === id ? '' : current)), 1600);
  }

  async function createKey() {
    setBusy(true);
    setError('');
    try {
      const created = await api.createMcpKey(name.trim() || '我的連接器');
      setFreshToken(created.token);
      setKeys((current) => [created.key, ...current.filter((item) => item.id !== created.key.id)]);
      await copy('token', created.token);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '金鑰產生失敗');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    setError('');
    try {
      await api.revokeMcpKey(id);
      setKeys((current) => current.map((item) => (
        item.id === id ? { ...item, revokedAt: new Date().toISOString() } : item
      )));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '金鑰撤銷失敗');
    }
  }

  const brandPrompt = singleBrandPrompt(currentBrand ? { name: currentBrand.name, slug: currentBrand.slug } : null);
  const allPrompt = portfolioPrompt();

  return (
    <div>
      <PageHeader
        title="AI 連接器"
        subtitle="把 Claude、Grok、ChatGPT 或 Gemini 接到 Go Marketing。金鑰只在產生當下看得到。"
      />

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 600, minWidth: 220, flex: 1 }}>
            金鑰名稱
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={40}
              style={{
                padding: '10px 12px', borderRadius: 10, border: '1px solid var(--color-border)',
                fontSize: 14, background: 'var(--color-bg-soft)', outline: 'none', fontWeight: 500,
              }}
            />
          </label>
          <Button type="button" onClick={createKey} disabled={busy}>
            {busy ? '產生中…' : '產生金鑰並複製'}
          </Button>
        </div>
        {user?.role === 'viewer' && (
          <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.7 }}>
            這個帳號是唯讀。接上之後可以查行程和成效，不能產稿、排程或上傳素材。
          </p>
        )}
        {freshToken && (
          <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: 'var(--color-bg-soft)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>這把金鑰只顯示一次</div>
            <code style={{ display: 'block', fontSize: 13, wordBreak: 'break-all', lineHeight: 1.6 }}>{freshToken}</code>
            <button
              type="button"
              onClick={() => copy('token', freshToken)}
              style={{ marginTop: 8, background: 'none', border: 'none', color: 'var(--color-primary-dark)', fontWeight: 700, cursor: 'pointer', padding: 0 }}
            >
              {copied === 'token' ? '已複製' : '複製金鑰'}
            </button>
          </div>
        )}
        <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
          {loading && <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-muted)' }}>載入金鑰…</p>}
          {!loading && keys.length === 0 && (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-muted)' }}>還沒有金鑰。</p>
          )}
          {keys.map((item) => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', fontSize: 13 }}>
              <div>
                <strong>{item.name}</strong>
                <span style={{ color: 'var(--color-text-muted)' }}> · {item.keyPrefix}… · {item.revokedAt ? '已撤銷' : `最後使用 ${when(item.lastUsedAt)}`}</span>
              </div>
              {!item.revokedAt && (
                <Button type="button" variant="danger" onClick={() => revoke(item.id)}>撤銷</Button>
              )}
            </div>
          ))}
        </div>
        {error && <p style={{ margin: '12px 0 0', color: '#B85454', fontSize: 13 }}>{error}</p>}
      </Card>

      <Card>
        <Tabs
          tabs={CLIENTS.map((item) => ({ id: item.id, label: item.label }))}
          active={client}
          onChange={(id) => setClient(id as ClientId)}
        />
        <h2 style={{ fontSize: 18, margin: '18px 0 10px' }}>{active.title}</h2>
        <ol style={{ margin: '0 0 16px', paddingLeft: 20, lineHeight: 1.75, fontSize: 14 }}>
          {active.steps.map((step) => <li key={step}>{step}</li>)}
        </ol>
        <PromptBox
          title={`貼給 ${active.label} 的訊息 · 單一品牌`}
          text={brandPrompt}
          copied={copied === 'brand'}
          onCopy={() => copy('brand', brandPrompt)}
        />
        <PromptBox
          title={`貼給 ${active.label} 的訊息 · 三品牌總和助理`}
          text={allPrompt}
          copied={copied === 'all'}
          onCopy={() => copy('all', allPrompt)}
        />
        <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--color-text-muted)' }}>
          MCP 網址：<a href={url}>{url}</a>
        </p>
      </Card>
    </div>
  );
}

function PromptBox({ title, text, copied, onCopy }: { title: string; text: string; copied: boolean; onCopy: () => void }) {
  return (
    <div style={{ marginTop: 12, padding: 14, borderRadius: 12, background: 'var(--color-bg-soft)' }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{title}</div>
      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13.5, lineHeight: 1.7 }}>{text}</pre>
      <button
        type="button"
        onClick={onCopy}
        style={{ marginTop: 10, background: 'none', border: 'none', color: 'var(--color-primary-dark)', fontWeight: 700, cursor: 'pointer', padding: 0 }}
      >
        {copied ? '已複製' : '複製這段話'}
      </button>
    </div>
  );
}
