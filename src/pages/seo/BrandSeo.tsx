import { useEffect, useState, type CSSProperties } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useBrand } from '@/context/BrandContext';
import { api, ApiError } from '@/lib/api';
import { useAsyncData, LoadingState, ErrorState } from '@/hooks/useAsyncData';
import {
  buildSeoDeveloperMarkdown,
  downloadTextFile,
  seoBriefFilename,
} from '@/lib/seo-brief';
import type { SeoFinding, SeoPriority, SeoFindingCategory, SeoAudit } from '@/types';

const PRIORITY_TONE: Record<SeoPriority, BadgeTone> = {
  P0: 'danger',
  P1: 'accent',
  P2: 'secondary',
  P3: 'default',
};

const CATEGORY_LABEL: Record<SeoFindingCategory, string> = {
  indexability: '收錄',
  on_page: '頁面',
  content: '內容',
  structured_data: '結構化資料',
  aeo: 'AEO',
  trust: '信任',
  internal_linking: '內鏈',
};

const OWNER_LABEL = {
  engineering: '工程',
  content: '內容',
  brand: '品牌',
};

function scoreTone(score: number): BadgeTone {
  if (score >= 80) return 'primary';
  if (score >= 60) return 'accent';
  return 'danger';
}

function scoreRing(score: number) {
  const color = score >= 80 ? 'var(--color-primary-dark)' : score >= 60 ? 'var(--color-accent)' : 'var(--color-danger)';
  return {
    width: 88,
    height: 88,
    borderRadius: '50%',
    border: `6px solid ${color}`,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    background: 'var(--color-bg-soft)',
  };
}

export function BrandSeo() {
  const { brand: slug } = useParams();
  const { brandBySlug, brandsLoading } = useBrand();
  const brand = slug ? brandBySlug(slug) : undefined;
  const [running, setRunning] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [contentId, setContentId] = useState<string | null>(null);

  const query = useAsyncData(
    () => (slug ? api.seoReport(slug) : Promise.reject(new Error('no slug'))),
    [slug],
  );

  useEffect(() => {
    setNotice(null);
    setContentId(null);
    setRunning(false);
    setGenerating(null);
  }, [slug]);

  if (!brand) return brandsLoading ? <LoadingState /> : <Navigate to="/" replace />;
  if (query.loading) return <LoadingState />;
  if (query.error || !query.data) return <ErrorState message={query.error ?? '載入失敗'} onRetry={query.reload} />;

  const data = query.data;
  const audit = data.audit;
  const findings = audit?.findings ?? [];
  const grouped: SeoPriority[] = ['P0', 'P1', 'P2', 'P3'];

  async function runAudit() {
    if (!slug || running) return;
    setRunning(true);
    setNotice('正在抓取官網 HTML、robots、sitemap 與文章區…這是唯讀健檢，不會改你的網站。');
    try {
      await api.runSeoAudit(slug);
      setNotice('健檢完成。分數是技術與內容診斷，不保證排名或 AI 引用。');
      query.reload();
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : '健檢失敗');
    } finally {
      setRunning(false);
    }
  }

  function briefInput(target: { name: string; slug: string; siteUrl: string | null; productUrl?: string | null; audit: SeoAudit }) {
    return {
      brandName: target.name,
      brandSlug: target.slug,
      siteUrl: target.siteUrl,
      productUrl: target.productUrl,
      audit: target.audit,
    };
  }

  function downloadCurrentMarkdown() {
    if (!audit || !slug || !brand) return;
    downloadTextFile(
      seoBriefFilename(slug, audit.createdAt),
      buildSeoDeveloperMarkdown(briefInput({
        name: brand.name,
        slug,
        siteUrl: data.siteUrl,
        productUrl: data.productUrl,
        audit,
      })),
    );
    setNotice(`已下載 ${brand.name} 優化清單 Markdown，可直接寄給官網開發者。`);
  }

  async function generateFromGap(topic: string) {
    if (!slug || generating) return;
    setGenerating(topic);
    setNotice(`正在寫「${topic}」官網長文…`);
    try {
      const res = await api.generateSeoFromTopic(slug, {
        topic,
        instruction: '這篇用來補官網 SEO 內容缺口。對準搜尋意圖，answer-first，不要發明數據。',
      });
      setContentId(res.contentId);
      setNotice(`已生成「${res.title}」，請到內容中心審閱後發布到官網。`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : '產文失敗');
    } finally {
      setGenerating(null);
    }
  }

  return (
    <div>
      <PageHeader
        title={`${brand.name} 官網 SEO`}
        subtitle="顧問模式健檢技術 SEO／AEO，內容缺口可直接產官網長文。預設只分析、不改站。"
        actions={
          <>
            {audit && (
              <Button variant="ghost" onClick={downloadCurrentMarkdown}>下載 Markdown</Button>
            )}
            <Button variant="primary" disabled={running} onClick={() => void runAudit()}>
              {running ? '健檢中…' : audit ? '重新健檢' : '執行官網健檢'}
            </Button>
          </>
        }
      />

      <Card style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.7 }}>
          行銷官網：{data.siteUrl ? <a href={data.siteUrl} target="_blank" rel="noreferrer">{data.siteUrl}</a> : '尚未設定'}
          {data.productUrl ? <>　·　產品入口：<a href={data.productUrl} target="_blank" rel="noreferrer">{data.productUrl}</a></> : null}
          。方法參考 <a href="https://github.com/mars-tw/open-seo-advisor-skill" target="_blank" rel="noreferrer">Open SEO Advisor</a>
          （顧問 Finding／健康分數 + 文章寫手 E-E-A-T）。Google 不把 llms.txt 當排名因素。
        </div>
      </Card>

      {notice && (
        <Card style={{ marginBottom: 12, borderLeft: '4px solid var(--color-primary)' }}>
          <div className="card-row" style={{ alignItems: 'center', gap: 12 }}>
            <p style={{ fontSize: 13, flex: 1 }}>{notice}</p>
            {contentId && (
              <Link to={`/${brand.slug}/contents`} style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-primary-dark)', textDecoration: 'none', flexShrink: 0 }}>
                前往內容中心 →
              </Link>
            )}
          </div>
        </Card>
      )}

      {!audit && (
        <Card>
          <strong style={{ display: 'block', marginBottom: 8 }}>還沒有健檢報告</strong>
          <p style={{ fontSize: 13, lineHeight: 1.7 }}>
            按右上角執行一次，系統會抓首頁、robots.txt、sitemap、/blog，對照品牌不可宣稱與主題庫，產出 P0–P3 待辦與可產文的內容缺口。
          </p>
        </Card>
      )}

      {audit && (
        <>
          <div className="grid-3" style={{ marginBottom: 12, gap: 12 }}>
            <Card>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <div style={scoreRing(audit.healthScore)}>
                  <strong style={{ fontSize: 22, lineHeight: 1 }}>{audit.healthScore}</strong>
                  <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>/ 100</span>
                </div>
                <div>
                  <Badge tone={scoreTone(audit.healthScore)}>健康分數</Badge>
                  <p style={{ fontSize: 13, marginTop: 8, lineHeight: 1.6 }}>{audit.summary}</p>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 6 }}>
                    {new Date(audit.createdAt).toLocaleString('zh-TW')}
                  </div>
                </div>
              </div>
            </Card>
            {grouped.slice(0, 2).map((priority) => {
              const count = findings.filter((f) => f.priority === priority).length;
              return (
                <Card key={priority}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <strong>{priority} {priority === 'P0' ? '立刻處理' : '本週處理'}</strong>
                    <Badge tone={PRIORITY_TONE[priority]}>{count}</Badge>
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                    {findings.filter((f) => f.priority === priority).slice(0, 3).map((f) => (
                      <div key={f.id} style={{ padding: '4px 0', borderTop: '1px solid var(--color-border)' }}>▪ {f.title}</div>
                    ))}
                    {count === 0 && <p>沒有這一級問題。</p>}
                  </div>
                </Card>
              );
            })}
          </div>

          <Card style={{ marginBottom: 12 }}>
            <strong style={{ display: 'block', marginBottom: 10 }}>白話懶人包</strong>
            <pre style={{
              whiteSpace: 'pre-wrap',
              fontFamily: 'inherit',
              fontSize: 13,
              lineHeight: 1.7,
              margin: 0,
              color: 'var(--color-text)',
            }}
            >
              {audit.beginnerReport}
            </pre>
          </Card>

          <Card style={{ marginBottom: 12 }}>
            <div className="card-row" style={{ alignItems: 'center', marginBottom: 10 }}>
              <strong>優化待辦</strong>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button variant="ghost" style={{ fontSize: 12, padding: '4px 12px' }} onClick={downloadCurrentMarkdown}>
                  下載 Markdown
                </Button>
              </div>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {audit.recommendations.map((rec) => (
                <div key={rec.title} style={{ border: '1px solid var(--color-border)', borderRadius: 10, padding: 12 }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                    <Badge tone={PRIORITY_TONE[rec.priority]}>{rec.priority}</Badge>
                    <Badge tone="secondary">{OWNER_LABEL[rec.owner]}</Badge>
                    <strong style={{ fontSize: 13 }}>{rec.title}</strong>
                  </div>
                  <p style={{ fontSize: 13, lineHeight: 1.6 }}>{rec.detail}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card style={{ marginBottom: 12 }}>
            <strong style={{ display: 'block', marginBottom: 10 }}>內容缺口（可直接產官網長文）</strong>
            {audit.contentGaps.length === 0 && <p style={{ fontSize: 13 }}>主題庫主力搜尋題已有對應長文或草稿。</p>}
            <div style={{ display: 'grid', gap: 8 }}>
              {audit.contentGaps.map((gap) => (
                <div key={gap.topic} style={{ border: '1px solid var(--color-border)', borderRadius: 10, padding: 12 }}>
                  <div className="card-row" style={{ alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                        <Badge tone={PRIORITY_TONE[gap.priority]}>{gap.priority}</Badge>
                        {gap.primaryKeyword && <Badge tone="primary">{gap.primaryKeyword}</Badge>}
                        {gap.audience && <Badge>{gap.audience === 'merchant' ? '業者' : '消費者'}</Badge>}
                      </div>
                      <strong style={{ fontSize: 14 }}>{gap.topic}</strong>
                      <p style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.6 }}>{gap.reason}</p>
                    </div>
                    <Button
                      variant="primary"
                      disabled={generating !== null}
                      style={{ fontSize: 12, padding: '4px 12px', flexShrink: 0 }}
                      onClick={() => void generateFromGap(gap.topic)}
                    >
                      {generating === gap.topic ? '產文中…' : '產生這篇長文'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {grouped.map((priority) => {
            const list = findings.filter((f) => f.priority === priority);
            if (!list.length) return null;
            return (
              <Card key={priority} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                  <strong>{priority} 完整 Finding</strong>
                  <Badge tone={PRIORITY_TONE[priority]}>{list.length}</Badge>
                </div>
                {list.map((finding) => (
                  <FindingRow key={finding.id} finding={finding} onWrite={finding.contentTopic ? () => void generateFromGap(finding.contentTopic!) : undefined} busy={generating !== null} />
                ))}
              </Card>
            );
          })}

          <Card style={{ marginBottom: 12 }}>
            <strong style={{ display: 'block', marginBottom: 10 }}>抽查頁面</strong>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--color-text-muted)' }}>
                    <th style={th}>URL</th>
                    <th style={th}>狀態</th>
                    <th style={th}>Title</th>
                    <th style={th}>H1</th>
                    <th style={th}>JSON-LD</th>
                    <th style={th}>字數</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.pages.map((page) => (
                    <tr key={page.url}>
                      <td style={td}>
                        <a href={page.url} target="_blank" rel="noreferrer">{page.url.replace(/^https?:\/\//, '')}</a>
                      </td>
                      <td style={td}>{page.error ? page.error : page.status ?? '—'}</td>
                      <td style={td}>{page.title || '—'}</td>
                      <td style={td}>{page.h1[0] || '—'}</td>
                      <td style={td}>{page.jsonLdTypes.join(', ') || '—'}</td>
                      <td style={td}>{page.wordCount || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {data.history.length > 1 && (
            <Card>
              <strong style={{ display: 'block', marginBottom: 10 }}>歷史健檢</strong>
              {data.history.slice(1).map((row) => (
                <div key={row.id} style={{ fontSize: 13, padding: '6px 0', borderTop: '1px solid var(--color-border)' }}>
                  {new Date(row.createdAt).toLocaleString('zh-TW')}　
                  <Badge tone={scoreTone(row.healthScore)}>{row.healthScore} 分</Badge>
                 　{row.summary}
                </div>
              ))}
            </Card>
          )}
        </>
      )}
    </div>
  );
}

const th: CSSProperties = { padding: '6px 8px', fontWeight: 600, borderBottom: '1px solid var(--color-border)' };
const td: CSSProperties = { padding: '8px', borderBottom: '1px solid var(--color-border)', verticalAlign: 'top' };

function FindingRow({
  finding,
  onWrite,
  busy,
}: {
  finding: SeoFinding;
  onWrite?: () => void;
  busy: boolean;
}) {
  return (
    <div style={{ padding: '10px 0', borderTop: '1px solid var(--color-border)' }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
        <Badge>{finding.id}</Badge>
        <Badge tone="secondary">{CATEGORY_LABEL[finding.category]}</Badge>
        <strong style={{ fontSize: 13 }}>{finding.title}</strong>
      </div>
      <p style={{ fontSize: 12.5, lineHeight: 1.6 }}><strong>影響：</strong>{finding.impact}</p>
      <p style={{ fontSize: 12.5, lineHeight: 1.6 }}><strong>證據：</strong>{finding.evidence}</p>
      <p style={{ fontSize: 12.5, lineHeight: 1.6 }}><strong>建議：</strong>{finding.recommendation}</p>
      {finding.url && (
        <p style={{ fontSize: 12, marginTop: 4 }}>
          <a href={finding.url} target="_blank" rel="noreferrer">{finding.url}</a>
        </p>
      )}
      {onWrite && (
        <Button variant="primary" disabled={busy} style={{ fontSize: 12, padding: '4px 12px', marginTop: 8 }} onClick={onWrite}>
          產生對應長文
        </Button>
      )}
    </div>
  );
}
