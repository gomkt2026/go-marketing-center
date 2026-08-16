import { useEffect, useState, type ReactNode, type CSSProperties } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Tabs';
import { useBrand } from '@/context/BrandContext';
import { api } from '@/lib/api';
import { useAsyncData, LoadingState, ErrorState } from '@/hooks/useAsyncData';
import type {
  BrandRule, BrandAudience, BrandPersona, BrandChannel, BrandVisual,
  BrandKeyword, BrandExample, BrandDocument, BrandVersion, VerificationStatus,
  BrandAsset, BrandAssetImageCategory, PressCoverage, PressRelease, DiscoveredPressItem,
} from '@/types';

const TABS = [
  { id: 'core', label: '品牌核心' },
  { id: 'audience', label: '受眾' },
  { id: 'channel', label: '平台調性' },
  { id: 'rules', label: '規則邊界' },
  { id: 'press', label: '媒體報導' },
  { id: 'releases', label: '新聞稿' },
  { id: 'visual', label: '視覺' },
  { id: 'library', label: '素材庫' },
  { id: 'raw', label: '原始檢視' },
];

const verificationTone: Record<VerificationStatus, BadgeTone> = {
  verified: 'primary', claimed: 'accent', pending: 'default',
};
const verificationLabel: Record<VerificationStatus, string> = {
  verified: '✅ 已驗證', claimed: '⚠️ 行銷宣稱', pending: '待驗證',
};
const ruleTypeLabel: Record<string, { label: string; tone: BadgeTone }> = {
  can_claim: { label: '可宣稱', tone: 'primary' },
  cannot_claim: { label: '不可宣稱', tone: 'danger' },
  marketing_rule: { label: '行銷規則', tone: 'secondary' },
  negative_rule: { label: '負面表列', tone: 'danger' },
};

const IMAGE_CATEGORY_OPTIONS: { value: BrandAssetImageCategory; label: string }[] = [
  { value: 'system_screenshot', label: '系統畫面截圖' },
  { value: 'real_photo', label: '實際拍攝照片' },
  { value: 'people', label: '人物照片' },
  { value: 'scene', label: '場景照片' },
  { value: 'brand_collab', label: '合作品牌照片' },
  { value: 'press_clipping', label: '見報截圖' },
  { value: 'other', label: '其他' },
];
const imageCategoryLabel: Record<string, string> = Object.fromEntries(
  IMAGE_CATEGORY_OPTIONS.map((o) => [o.value, o.label]),
);

export function BrandIntelligence() {
  const { brand: slug } = useParams();
  const { brandBySlug, brandsLoading } = useBrand();
  const brand = slug ? brandBySlug(slug) : undefined;
  const [tab, setTab] = useState('core');
  const [rules, setRules] = useState<BrandRule[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [assets, setAssets] = useState<BrandAsset[]>([]);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadCaption, setUploadCaption] = useState('');
  const [uploadCategory, setUploadCategory] = useState<BrandAssetImageCategory>('system_screenshot');
  const [uploading, setUploading] = useState(false);
  const [assetError, setAssetError] = useState<string | null>(null);
  const [generatingAssetId, setGeneratingAssetId] = useState<string | null>(null);
  const [generatedContentId, setGeneratedContentId] = useState<string | null>(null);
  const [coverages, setCoverages] = useState<PressCoverage[]>([]);
  const [releases, setReleases] = useState<PressRelease[]>([]);
  const [pressBusyId, setPressBusyId] = useState<string | null>(null);
  const [pressMessage, setPressMessage] = useState<string | null>(null);
  const emptyCoverage = { outlet: '', headline: '', articleUrl: '', publishedOn: '', summary: '', keyQuotes: '', claimableFacts: '' };
  const [newCoverage, setNewCoverage] = useState(emptyCoverage);
  const [parseBusy, setParseBusy] = useState(false);
  const [discoverBusy, setDiscoverBusy] = useState(false);
  const [convertBusy, setConvertBusy] = useState(false);
  const [convertingUrl, setConvertingUrl] = useState<string | null>(null);
  const [parseNotes, setParseNotes] = useState<string[]>([]);
  const [discovered, setDiscovered] = useState<DiscoveredPressItem[]>([]);
  const [newRelease, setNewRelease] = useState({ title: '', body: '' });
  const [editingReleaseId, setEditingReleaseId] = useState<string | null>(null);

  const brandQuery = useAsyncData(
    () => slug ? api.brand(slug) : Promise.reject(new Error('no slug')),
    [slug],
  );
  const intelQuery = useAsyncData(
    () => slug ? api.brandIntelligence(slug) : Promise.reject(new Error('no slug')),
    [slug],
  );

  useEffect(() => {
    if (intelQuery.data?.rules) setRules(intelQuery.data.rules);
  }, [intelQuery.data?.rules]);
  useEffect(() => {
    if (intelQuery.data?.assets) setAssets(intelQuery.data.assets);
  }, [intelQuery.data?.assets]);
  useEffect(() => {
    if (intelQuery.data?.pressCoverages) setCoverages(intelQuery.data.pressCoverages);
  }, [intelQuery.data?.pressCoverages]);
  useEffect(() => {
    if (intelQuery.data?.pressReleases) setReleases(intelQuery.data.pressReleases);
  }, [intelQuery.data?.pressReleases]);

  if (!brand) return brandsLoading ? <LoadingState /> : <Navigate to="/" replace />;
  if (brandQuery.loading || intelQuery.loading) return <LoadingState />;
  if (brandQuery.error || intelQuery.error) {
    return <ErrorState message={brandQuery.error ?? intelQuery.error ?? '載入失敗'} onRetry={() => { brandQuery.reload(); intelQuery.reload(); }} />;
  }

  const version = brandQuery.data?.version as BrandVersion | null | undefined;
  const intel = intelQuery.data!;
  const audiences = intel.audiences as BrandAudience[];
  const personas = intel.personas as BrandPersona[];
  const channels = intel.channels as BrandChannel[];
  const visuals = intel.visuals as BrandVisual[];
  const keywords = intel.keywords as BrandKeyword[];
  const documents = intel.documents as BrandDocument[];
  const pillars = (intel.examples as BrandExample[]).filter((e) => e.category === 'content_pillar');
  const hotTopics = (intel.examples as BrandExample[]).filter((e) => e.category === 'hot_topic_bank');

  async function archiveRule(id: string) {
    await api.deleteBrandRule(id);
    setRules((prev) => prev.filter((r) => r.id !== id));
  }

  async function addRule() {
    if (!brand) return;
    const { rule } = await api.createBrandRule({
      brandId: brand.id,
      ruleType: 'marketing_rule',
      statement: '新規則(點擊編輯以填寫內容)',
      verification: 'pending',
    });
    setRules((prev) => [...prev, rule]);
    setEditingId(rule.id);
  }

  async function uploadAsset() {
    if (!slug || !uploadFile) return;
    setUploading(true);
    setAssetError(null);
    try {
      const { asset } = await api.uploadBrandAsset(slug, {
        file: uploadFile, caption: uploadCaption.trim() || undefined, imageCategory: uploadCategory,
      });
      setAssets((prev) => [asset, ...prev]);
      setUploadFile(null);
      setUploadCaption('');
    } catch (e) {
      setAssetError(e instanceof Error ? e.message : '上傳失敗');
    } finally {
      setUploading(false);
    }
  }

  async function deleteAsset(id: string) {
    if (!slug) return;
    await api.deleteBrandAsset(slug, id);
    setAssets((prev) => prev.filter((a) => a.id !== id));
  }

  async function generateFromAsset(id: string) {
    if (!slug) return;
    setGeneratingAssetId(id);
    setAssetError(null);
    setGeneratedContentId(null);
    try {
      const { contentId } = await api.generatePostFromAsset(slug, id);
      setGeneratedContentId(contentId);
      setAssets((prev) => prev.map((a) => (a.id === id
        ? { ...a, usedInThreadsCount: a.usedInThreadsCount + 1, lastUsedAt: new Date().toISOString() }
        : a)));
    } catch (e) {
      setAssetError(e instanceof Error ? e.message : '生成失敗');
    } finally {
      setGeneratingAssetId(null);
    }
  }

  function coveragePayload() {
    return {
      url: newCoverage.articleUrl.trim() || undefined,
      articleUrl: newCoverage.articleUrl.trim() || undefined,
      outlet: newCoverage.outlet.trim() || undefined,
      headline: newCoverage.headline.trim() || undefined,
      publishedOn: newCoverage.publishedOn || undefined,
      summary: newCoverage.summary.trim() || undefined,
      keyQuotes: newCoverage.keyQuotes.split('\n').map((s) => s.trim()).filter(Boolean),
      claimableFacts: newCoverage.claimableFacts.split('\n').map((s) => s.trim()).filter(Boolean),
    };
  }

  async function parseCoverageUrl() {
    if (!slug || !newCoverage.articleUrl.trim()) {
      setPressMessage('請先貼上原文連結');
      return;
    }
    setParseBusy(true);
    setPressMessage(null);
    try {
      const { parsed } = await api.parsePressCoverage(slug, newCoverage.articleUrl.trim());
      setNewCoverage({
        outlet: parsed.outlet,
        headline: parsed.headline,
        articleUrl: parsed.canonicalUrl || parsed.articleUrl,
        publishedOn: parsed.publishedOn ?? '',
        summary: parsed.summary,
        keyQuotes: parsed.keyQuotes.join('\n'),
        claimableFacts: parsed.claimableFacts.join('\n'),
      });
      setParseNotes(parsed.parseNotes);
      setPressMessage(parsed.headline ? '已解析，請確認後按「轉換並存入行銷中心」' : '只解析到部分欄位，請補齊標題後再轉換');
    } catch (e) {
      setPressMessage(e instanceof Error ? e.message : '解析失敗');
    } finally {
      setParseBusy(false);
    }
  }

  async function discoverCoverages() {
    if (!slug) return;
    setDiscoverBusy(true);
    setPressMessage(null);
    try {
      const { items } = await api.discoverPressCoverages(slug);
      setDiscovered(items);
      setPressMessage(items.length ? `從網路撈到 ${items.length} 則候選，確認後按轉換即可入庫` : '這輪沒有撈到品牌相關報導');
    } catch (e) {
      setPressMessage(e instanceof Error ? e.message : '撈取失敗');
    } finally {
      setDiscoverBusy(false);
    }
  }

  async function convertCoverage(source?: DiscoveredPressItem) {
    if (!slug) return;
    const body = source
      ? { url: source.url ?? undefined, headline: source.title, outlet: source.outletGuess, summary: source.snippet ?? undefined }
      : coveragePayload();
    if (!source && !body.url && (!body.outlet || !body.headline)) {
      setPressMessage('請貼上原文連結，或先填媒體名稱與標題');
      return;
    }
    const busyKey = source?.url ?? source?.title ?? 'form';
    setConvertBusy(true);
    setConvertingUrl(busyKey);
    setPressMessage(null);
    try {
      let result: { coverage: PressCoverage; parseNotes?: string[]; alreadyExists?: boolean };
      try {
        result = await api.convertPressCoverage(slug, body);
      } catch (e) {
        const msg = e instanceof Error ? e.message : '';
        if (!/press_coverages.*does not exist/i.test(msg)) throw e;
        setPressMessage('資料表尚未建立，正在自動補上…');
        await api.migratePress();
        result = await api.convertPressCoverage(slug, body);
      }
      const { coverage, parseNotes: notes, alreadyExists } = result;
      setCoverages((prev) => [coverage, ...prev.filter((c) => c.id !== coverage.id)]);
      if (source) {
        setDiscovered((prev) => prev.map((item) => (
          item.url === source.url && item.title === source.title ? { ...item, alreadySaved: true } : item
        )));
      } else {
        setNewCoverage(emptyCoverage);
        setParseNotes([]);
      }
      if (notes?.length) setParseNotes(notes);
      setPressMessage(alreadyExists
        ? '此連結已在行銷中心，已帶出既有報導'
        : '已轉換並存入行銷中心，之後生成文案可引用');
    } catch (e) {
      setPressMessage(e instanceof Error ? e.message : '轉換失敗');
    } finally {
      setConvertBusy(false);
      setConvertingUrl(null);
    }
  }

  async function approveCoverage(id: string, dismiss = false) {
    if (!slug) return;
    setPressBusyId(id);
    setPressMessage(null);
    try {
      const { coverage } = await api.approvePressCoverage(slug, id, { dismiss });
      setCoverages((prev) => prev.map((c) => (c.id === id ? coverage : c)));
      setPressMessage(dismiss ? '已忽略' : '已核准,之後生成文案可引用');
    } catch (e) {
      setPressMessage(e instanceof Error ? e.message : '操作失敗');
    } finally {
      setPressBusyId(null);
    }
  }

  async function generateCoveragePosts(id: string) {
    if (!slug) return;
    setPressBusyId(id);
    setPressMessage(null);
    try {
      const res = await api.generateFromPressCoverage(slug, id);
      setPressMessage(`已生成 ${res.created.length} 則社群草稿,請到內容中心審閱`);
    } catch (e) {
      setPressMessage(e instanceof Error ? e.message : '生成失敗');
    } finally {
      setPressBusyId(null);
    }
  }

  async function generateCoverageArticle(id: string) {
    if (!slug) return;
    setPressBusyId(id);
    setPressMessage(null);
    try {
      const res = await api.generateArticleFromPressCoverage(slug, id);
      setPressMessage(`已生成 SEO 長文「${res.title}」,請到內容中心審閱`);
    } catch (e) {
      setPressMessage(e instanceof Error ? e.message : '生成失敗');
    } finally {
      setPressBusyId(null);
    }
  }

  async function addRelease() {
    if (!slug || !newRelease.title.trim() || !newRelease.body.trim()) return;
    setPressMessage(null);
    try {
      const { release } = await api.createPressRelease(slug, newRelease);
      setReleases((prev) => [release, ...prev]);
      setNewRelease({ title: '', body: '' });
      setPressMessage('已建立新聞稿草稿');
    } catch (e) {
      setPressMessage(e instanceof Error ? e.message : '建立失敗');
    }
  }

  async function saveRelease(r: PressRelease) {
    if (!slug) return;
    setPressBusyId(r.id);
    try {
      const { release } = await api.updatePressRelease(slug, r.id, { title: r.title, body: r.body });
      setReleases((prev) => prev.map((x) => (x.id === r.id ? release : x)));
      setEditingReleaseId(null);
    } catch (e) {
      setPressMessage(e instanceof Error ? e.message : '儲存失敗');
    } finally {
      setPressBusyId(null);
    }
  }

  async function reviewRelease(id: string, action: 'submit' | 'approve' | 'return' | 'finalize') {
    if (!slug) return;
    setPressBusyId(id);
    setPressMessage(null);
    try {
      const { release } = await api.reviewPressRelease(slug, id, action);
      setReleases((prev) => prev.map((x) => (x.id === id ? release : x)));
    } catch (e) {
      setPressMessage(e instanceof Error ? e.message : '審核失敗');
    } finally {
      setPressBusyId(null);
    }
  }

  async function generateReleasePosts(id: string) {
    if (!slug) return;
    setPressBusyId(id);
    setPressMessage(null);
    try {
      const res = await api.generateFromPressRelease(slug, id);
      setPressMessage(`已準備 ${res.created.length} 則社群素材(不會寫成已見報),請到內容中心審閱`);
    } catch (e) {
      setPressMessage(e instanceof Error ? e.message : '生成失敗');
    } finally {
      setPressBusyId(null);
    }
  }

  async function generateReleaseArticle(id: string) {
    if (!slug) return;
    setPressBusyId(id);
    setPressMessage(null);
    try {
      const res = await api.generateArticleFromPressRelease(slug, id);
      setPressMessage(`已生成 SEO 長文「${res.title}」,請到內容中心審閱`);
    } catch (e) {
      setPressMessage(e instanceof Error ? e.message : '生成失敗');
    } finally {
      setPressBusyId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title={`${brand.name} 品牌智慧`}
        subtitle="結構化知識條目為唯一事實來源;Markdown 僅為發布時自動編譯的唯讀成品"
        actions={
          <>
            <Badge tone="primary">版本 v{version?.versionNumber ?? '-'} 已發布</Badge>
            <Button variant="ghost">歷史版本</Button>
            <Button variant="secondary">建立草稿並編輯</Button>
          </>
        }
      />

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '4px 16px 0' }}>
          <Tabs tabs={TABS} active={tab} onChange={setTab} />
        </div>
        <div style={{ padding: 20 }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
            >
              {tab === 'core' && (
                <div style={{ display: 'grid', gap: 14 }}>
                  <Field label="一句話定位">{brand.tagline}</Field>
                  <Field label="內容支柱(Content Pillars)">
                    <div style={{ display: 'grid', gap: 8 }}>
                      {pillars.map((p) => (
                        <div key={p.id} style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                          <Badge tone="secondary">{p.weightPercent}%</Badge>
                          <div>
                            <strong style={{ fontSize: 13 }}>{p.title}</strong>
                            <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{p.body}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Field>
                  {hotTopics.length > 0 && (
                    <Field label="熱點主題庫">
                      <div style={{ display: 'grid', gap: 8 }}>
                        {hotTopics.map((h) => (
                          <div key={h.id}>
                            <strong style={{ fontSize: 13 }}>{h.title}</strong>
                            <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{h.body}</div>
                          </div>
                        ))}
                      </div>
                    </Field>
                  )}
                  <Field label="關鍵訊息 / Hashtag / CTA">
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {keywords.map((k) => (
                        <Badge key={k.id} tone={k.category === 'hashtag' ? 'primary' : k.category === 'cta' ? 'accent' : 'default'}>
                          {k.value}
                        </Badge>
                      ))}
                    </div>
                  </Field>
                </div>
              )}

              {tab === 'audience' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                  {audiences.map((a) => (
                    <div key={a.id} style={cardBoxStyle}>
                      <strong style={{ fontSize: 14 }}>{a.name}</strong>
                      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '6px 0' }}>痛點:{a.painPoints.join('、')}</div>
                      <div style={{ fontSize: 12 }}>訴求角度:{a.appealAngle}</div>
                    </div>
                  ))}
                  {personas.map((p) => (
                    <div key={p.id} style={cardBoxStyle}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <Badge tone="secondary">{p.code}</Badge>
                        <strong style={{ fontSize: 14 }}>{p.name}</strong>
                      </div>
                      {p.ageRange && <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 6 }}>年齡層:{p.ageRange}</div>}
                      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '6px 0' }}>痛點:{p.painPoints.join('、')}</div>
                      <div style={{ fontSize: 12 }}>訴求角度:{p.appealAngle}</div>
                    </div>
                  ))}
                </div>
              )}

              {tab === 'channel' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                  {channels.map((c) => (
                    <div key={c.id} style={cardBoxStyle}>
                      <Badge tone="primary">{c.platform}</Badge>
                      <div style={{ fontSize: 12, margin: '8px 0 4px' }}><strong>語氣:</strong>{c.toneOfVoice}</div>
                      <div style={{ fontSize: 12, marginBottom: 4 }}><strong>字數:</strong>{c.lengthGuideline}</div>
                      <div style={{ fontSize: 12, marginBottom: 4 }}><strong>格式:</strong>{c.formatGuideline}</div>
                      <div style={{ fontSize: 12 }}><strong>Hashtag 數量:</strong>{c.hashtagCountMin}–{c.hashtagCountMax}</div>
                    </div>
                  ))}
                </div>
              )}

              {tab === 'rules' && (
                <div style={{ display: 'grid', gap: 10 }}>
                  {rules.map((r) => {
                    const meta = ruleTypeLabel[r.ruleType];
                    const isEditing = editingId === r.id;
                    return (
                      <motion.div key={r.id} layout style={cardBoxStyle}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                              <Badge tone={meta.tone}>{meta.label}</Badge>
                              <Badge tone={verificationTone[r.verification]}>{verificationLabel[r.verification]}</Badge>
                              {r.validUntil && <Badge tone="accent">失效日:{new Date(r.validUntil).toLocaleDateString('zh-TW')}</Badge>}
                            </div>
                            {isEditing ? (
                              <textarea
                                defaultValue={r.statement}
                                style={{ width: '100%', minHeight: 60, borderRadius: 8, border: '1px solid var(--color-border)', padding: 8, fontSize: 13, fontFamily: 'inherit' }}
                              />
                            ) : (
                              <div style={{ fontSize: 14 }}>{r.statement}</div>
                            )}
                            {r.conditionNote && <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>條件:{r.conditionNote}</div>}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <Button variant="ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setEditingId(isEditing ? null : r.id)}>
                              {isEditing ? '完成' : '編輯'}
                            </Button>
                            <Button variant="danger" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => void archiveRule(r.id)}>封存</Button>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                  <Button variant="secondary" style={{ justifySelf: 'start' }} onClick={() => void addRule()}>
                    + 新增規則
                  </Button>
                </div>
              )}

              {tab === 'press' && (
                <div style={{ display: 'grid', gap: 16 }}>
                  <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0 }}>
                    貼上新聞連結可自動解析媒體名、日期、標題與摘要；也可從網路撈取品牌相關報導，再按轉換寫入行銷中心。第三方只存標題、出處、摘要與短金句，不存全文。監測進來的先待確認，核准後才會被 AI 引用。
                  </p>
                  {pressMessage && <p style={{ fontSize: 13, color: 'var(--color-primary-dark)' }}>{pressMessage}</p>}
                  <div style={{ ...cardBoxStyle, display: 'grid', gap: 8 }}>
                    <strong style={{ fontSize: 13 }}>從連結解析或從網路撈取</strong>
                    <input
                      placeholder="貼上新聞原文連結"
                      value={newCoverage.articleUrl}
                      onChange={(e) => setNewCoverage((s) => ({ ...s, articleUrl: e.target.value }))}
                      style={inputStyle}
                    />
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <Button variant="secondary" disabled={parseBusy || convertBusy} onClick={() => void parseCoverageUrl()}>
                        {parseBusy ? '解析中…' : '解析連結'}
                      </Button>
                      <Button variant="ghost" disabled={discoverBusy} onClick={() => void discoverCoverages()}>
                        {discoverBusy ? '撈取中…' : '從網路撈取'}
                      </Button>
                    </div>
                    {parseNotes.length > 0 && (
                      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--color-text-muted)' }}>
                        {parseNotes.map((note) => <li key={note}>{note}</li>)}
                      </ul>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <input placeholder="媒體名稱" value={newCoverage.outlet} onChange={(e) => setNewCoverage((s) => ({ ...s, outlet: e.target.value }))} style={inputStyle} />
                      <input placeholder="見報日期" type="date" value={newCoverage.publishedOn} onChange={(e) => setNewCoverage((s) => ({ ...s, publishedOn: e.target.value }))} style={inputStyle} />
                    </div>
                    <input placeholder="標題" value={newCoverage.headline} onChange={(e) => setNewCoverage((s) => ({ ...s, headline: e.target.value }))} style={inputStyle} />
                    <textarea placeholder="摘要（我們整理的，不是原文）" value={newCoverage.summary} onChange={(e) => setNewCoverage((s) => ({ ...s, summary: e.target.value }))} style={{ ...inputStyle, minHeight: 64 }} />
                    <textarea placeholder="短金句（每行一句，可空白）" value={newCoverage.keyQuotes} onChange={(e) => setNewCoverage((s) => ({ ...s, keyQuotes: e.target.value }))} style={{ ...inputStyle, minHeight: 48 }} />
                    <textarea placeholder="可宣稱事實（每行一則，可空白）" value={newCoverage.claimableFacts} onChange={(e) => setNewCoverage((s) => ({ ...s, claimableFacts: e.target.value }))} style={{ ...inputStyle, minHeight: 48 }} />
                    <Button variant="primary" style={{ justifySelf: 'start' }} disabled={convertBusy} onClick={() => void convertCoverage()}>
                      {convertBusy && convertingUrl === 'form' ? '轉換中…' : '轉換並存入行銷中心'}
                    </Button>
                  </div>
                  {discovered.length > 0 && (
                    <div style={{ display: 'grid', gap: 10 }}>
                      <strong style={{ fontSize: 13 }}>網路撈取結果</strong>
                      {discovered.map((item) => {
                        const busyKey = item.url ?? item.title;
                        return (
                          <div key={`${item.url ?? ''}-${item.title}`} style={cardBoxStyle}>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                              <Badge tone={item.kind === 'own_coverage' ? 'primary' : item.kind === 'noise' ? 'danger' : 'secondary'}>
                                {item.kind === 'own_coverage' ? '品牌相關' : item.kind === 'industry_news' ? '產業新聞' : item.kind === 'noise' ? '可能無關' : '待分辨'}
                              </Badge>
                              <Badge tone="default">{item.outletGuess}</Badge>
                              {item.alreadySaved && <Badge tone="accent">已在庫中</Badge>}
                            </div>
                            <strong style={{ fontSize: 14 }}>{item.title}</strong>
                            {item.snippet && <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 6 }}>{item.snippet}</div>}
                            {item.url && (
                              <a href={item.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, display: 'inline-block', marginTop: 8 }}>
                                原文連結 →
                              </a>
                            )}
                            <div style={{ marginTop: 10 }}>
                              <Button
                                variant="primary"
                                style={{ padding: '4px 10px', fontSize: 12 }}
                                disabled={item.alreadySaved || !item.url || convertingUrl === busyKey}
                                onClick={() => void convertCoverage(item)}
                              >
                                {convertingUrl === busyKey ? '轉換中…' : '轉換並存入'}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {coverages.map((c) => (
                    <div key={c.id} style={cardBoxStyle}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                        <Badge tone={c.status === 'inbox' ? 'accent' : c.status === 'published' ? 'primary' : c.status === 'dismissed' ? 'danger' : 'secondary'}>
                          {c.status === 'inbox' ? '待確認' : c.status === 'published' ? '已核准主稿' : c.status === 'syndicated' ? '轉載' : '已忽略'}
                        </Badge>
                        <Badge tone="default">{c.outlet}</Badge>
                        {c.publishedOn && <Badge tone="default">{String(c.publishedOn).slice(0, 10)}</Badge>}
                        {c.discoverySource === 'scheduler' && <Badge tone="secondary">監測</Badge>}
                      </div>
                      <strong style={{ fontSize: 14 }}>{c.headline}</strong>
                      {c.summary && <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 6 }}>{c.summary}</div>}
                      {c.keyQuotes.length > 0 && <div style={{ fontSize: 12, marginTop: 6 }}>金句:{c.keyQuotes.join(' / ')}</div>}
                      {c.claimableFacts.length > 0 && <div style={{ fontSize: 12, marginTop: 4 }}>可引用:{c.claimableFacts.join('、')}</div>}
                      {c.articleUrl && (
                        <a href={c.articleUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, display: 'inline-block', marginTop: 8 }}>
                          原文連結 →
                        </a>
                      )}
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                        {c.status === 'inbox' && (
                          <>
                            <Button variant="primary" style={{ padding: '4px 10px', fontSize: 12 }} disabled={pressBusyId === c.id} onClick={() => void approveCoverage(c.id)}>核准</Button>
                            <Button variant="ghost" style={{ padding: '4px 10px', fontSize: 12 }} disabled={pressBusyId === c.id} onClick={() => void approveCoverage(c.id, true)}>忽略</Button>
                          </>
                        )}
                        {(c.status === 'published' || c.status === 'syndicated') && (
                          <>
                            <Button variant="secondary" style={{ padding: '4px 10px', fontSize: 12 }} disabled={pressBusyId === c.id} onClick={() => void generateCoveragePosts(c.id)}>生成社群貼文</Button>
                            <Button variant="ghost" style={{ padding: '4px 10px', fontSize: 12 }} disabled={pressBusyId === c.id} onClick={() => void generateCoverageArticle(c.id)}>生成 SEO 長文</Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                  {coverages.length === 0 && <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>尚無媒體報導</p>}
                </div>
              )}

              {tab === 'releases' && (
                <div style={{ display: 'grid', gap: 16 }}>
                  <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0 }}>
                    自家新聞稿可存全文。流程:草稿 → 送審 → 核准 → 定稿。定稿前不可讓 AI 寫成「已被媒體報導」。
                  </p>
                  {pressMessage && <p style={{ fontSize: 13, color: 'var(--color-primary-dark)' }}>{pressMessage}</p>}
                  <div style={{ ...cardBoxStyle, display: 'grid', gap: 8 }}>
                    <strong style={{ fontSize: 13 }}>新草稿</strong>
                    <input placeholder="標題" value={newRelease.title} onChange={(e) => setNewRelease((s) => ({ ...s, title: e.target.value }))} style={inputStyle} />
                    <textarea placeholder="全文" value={newRelease.body} onChange={(e) => setNewRelease((s) => ({ ...s, body: e.target.value }))} style={{ ...inputStyle, minHeight: 120 }} />
                    <Button variant="secondary" style={{ justifySelf: 'start' }} onClick={() => void addRelease()}>+ 建立草稿</Button>
                  </div>
                  {releases.map((r) => {
                    const editing = editingReleaseId === r.id;
                    return (
                      <div key={r.id} style={cardBoxStyle}>
                        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                          <Badge tone={r.status === 'final' ? 'primary' : r.status === 'pending_review' ? 'accent' : 'default'}>
                            {r.status === 'draft' ? '草稿' : r.status === 'pending_review' ? '待審核' : r.status === 'approved' ? '已核准' : '已定稿'}
                          </Badge>
                          {r.embargoOn && <Badge tone="secondary">禁載 {String(r.embargoOn).slice(0, 10)}</Badge>}
                        </div>
                        {editing ? (
                          <>
                            <input defaultValue={r.title} onBlur={(e) => { r.title = e.target.value; }} style={{ ...inputStyle, marginBottom: 8 }} />
                            <textarea defaultValue={r.body} onBlur={(e) => { r.body = e.target.value; }} style={{ ...inputStyle, minHeight: 160 }} />
                          </>
                        ) : (
                          <>
                            <strong style={{ fontSize: 14 }}>{r.title}</strong>
                            <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 8, whiteSpace: 'pre-wrap', maxHeight: 180, overflow: 'auto' }}>{r.body}</div>
                          </>
                        )}
                        {r.reviewNote && <div style={{ fontSize: 12, marginTop: 8 }}>審核意見:{r.reviewNote}</div>}
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                          {r.status !== 'final' && (
                            <Button variant="ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => {
                              if (editing) void saveRelease(r);
                              else setEditingReleaseId(r.id);
                            }}>
                              {editing ? '儲存' : '編輯'}
                            </Button>
                          )}
                          {r.status === 'draft' && <Button variant="secondary" style={{ padding: '4px 10px', fontSize: 12 }} disabled={pressBusyId === r.id} onClick={() => void reviewRelease(r.id, 'submit')}>送審</Button>}
                          {r.status === 'pending_review' && (
                            <>
                              <Button variant="primary" style={{ padding: '4px 10px', fontSize: 12 }} disabled={pressBusyId === r.id} onClick={() => void reviewRelease(r.id, 'approve')}>核准</Button>
                              <Button variant="ghost" style={{ padding: '4px 10px', fontSize: 12 }} disabled={pressBusyId === r.id} onClick={() => void reviewRelease(r.id, 'return')}>退回</Button>
                            </>
                          )}
                          {r.status === 'approved' && <Button variant="primary" style={{ padding: '4px 10px', fontSize: 12 }} disabled={pressBusyId === r.id} onClick={() => void reviewRelease(r.id, 'finalize')}>定稿</Button>}
                          {(r.status === 'approved' || r.status === 'final') && (
                            <>
                              <Button variant="secondary" style={{ padding: '4px 10px', fontSize: 12 }} disabled={pressBusyId === r.id} onClick={() => void generateReleasePosts(r.id)}>準備社群素材</Button>
                              <Button variant="ghost" style={{ padding: '4px 10px', fontSize: 12 }} disabled={pressBusyId === r.id} onClick={() => void generateReleaseArticle(r.id)}>生成 SEO 長文</Button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {releases.length === 0 && <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>尚無新聞稿</p>}
                </div>
              )}

              {tab === 'visual' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                  {visuals.map((v) => (
                    <div key={v.id} style={cardBoxStyle}>
                      {v.category === 'color' && (
                        <div style={{ width: '100%', height: 40, borderRadius: 8, background: v.value, marginBottom: 8, border: '1px solid var(--color-border)' }} />
                      )}
                      <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{v.label}</div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{v.value}</div>
                    </div>
                  ))}
                  {visuals.length === 0 && <p>尚無視覺規範資料</p>}
                </div>
              )}

              {tab === 'library' && (
                <div style={{ display: 'grid', gap: 24 }}>
                  <div>
                    <Field label="圖片素材庫(系統畫面截圖/實拍照片,可作為 Threads 圖片靈感貼文的話題來源)">
                      <div />
                    </Field>
                    <div style={{ ...cardBoxStyle, marginTop: 8 }}>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                        <input
                          type="file" accept="image/*"
                          onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                          style={{ fontSize: 12 }}
                        />
                        <select
                          value={uploadCategory}
                          onChange={(e) => setUploadCategory(e.target.value as BrandAssetImageCategory)}
                          style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--color-border)', fontSize: 13 }}
                        >
                          {IMAGE_CATEGORY_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                        <input
                          type="text" placeholder="說明(選填,例如:LINE 送洗履歷查詢畫面)"
                          value={uploadCaption}
                          onChange={(e) => setUploadCaption(e.target.value)}
                          style={{ flex: 1, minWidth: 200, padding: '7px 12px', borderRadius: 8, border: '1px solid var(--color-border)', fontSize: 13 }}
                        />
                        <Button variant="secondary" disabled={!uploadFile || uploading} onClick={() => void uploadAsset()}>
                          {uploading ? '上傳中…' : '+ 上傳圖片'}
                        </Button>
                      </div>
                      {assetError && <p style={{ fontSize: 12, color: 'var(--color-danger)', marginTop: 8 }}>{assetError}</p>}
                      {generatedContentId && (
                        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 8 }}>
                          已生成貼文草稿,請至內容審閱頁查看(content id: {generatedContentId})。
                        </p>
                      )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginTop: 12 }}>
                      {assets.map((a) => (
                        <div key={a.id} style={cardBoxStyle}>
                          {a.fileUrl && (
                            <img
                              src={a.fileUrl} alt={a.caption ?? a.name}
                              style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: 8, marginBottom: 8 }}
                            />
                          )}
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                            {a.imageCategory && <Badge tone="secondary">{imageCategoryLabel[a.imageCategory] ?? a.imageCategory}</Badge>}
                            {a.usedInThreadsCount > 0 && <Badge tone="default">已用 {a.usedInThreadsCount} 次</Badge>}
                          </div>
                          {a.caption && (
                            <div style={{ fontSize: 12.5, marginBottom: 8, wordBreak: 'break-word' }}>{a.caption}</div>
                          )}
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <Button
                              variant="primary" style={{ padding: '4px 10px', fontSize: 12 }}
                              disabled={generatingAssetId === a.id}
                              onClick={() => void generateFromAsset(a.id)}
                            >
                              {generatingAssetId === a.id ? '生成中…' : '用這張圖生成貼文'}
                            </Button>
                            <Button
                              variant="danger" style={{ padding: '4px 10px', fontSize: 12 }}
                              onClick={() => void deleteAsset(a.id)}
                            >
                              刪除
                            </Button>
                          </div>
                        </div>
                      ))}
                      {assets.length === 0 && (
                        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>尚未上傳任何圖片素材</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <Field label="文件">
                      <div />
                    </Field>
                    <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
                      {documents.map((d) => (
                        <div key={d.id} style={{ ...cardBoxStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 600 }}>{d.title}</div>
                            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{d.fileUrl}</div>
                          </div>
                          <Badge tone="secondary">{d.sourceType}</Badge>
                        </div>
                      ))}
                      {documents.length === 0 && (
                        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>尚無文件資料</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {tab === 'raw' && (
                <pre
                  style={{
                    background: 'var(--color-bg-soft)', borderRadius: 10, padding: 16, fontSize: 12.5,
                    lineHeight: 1.7, whiteSpace: 'pre-wrap', color: 'var(--color-text)', maxHeight: 480, overflowY: 'auto',
                  }}
                >
{`# ${brand.name} 品牌知識庫(Brand Knowledge Base)

> 版本: v${version?.versionNumber ?? '-'} | 狀態: published
> 發布時間: ${version?.publishedAt ? new Date(version.publishedAt).toLocaleString('zh-TW') : '-'}
> 本檔案由系統自動編譯,不可手動修改。如需修改請至上方分頁編輯結構化條目。

## 1. 品牌總覽
一句話定位: ${brand.tagline}

## 3. 目標受眾
${audiences.map((a) => `- ${a.name}:${a.appealAngle}`).join('\n')}

## 7. 品牌規則
${rules.map((r) => `- [${ruleTypeLabel[r.ruleType].label}] ${r.statement}`).join('\n')}
`}
                </pre>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 14 }}>{children}</div>
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
