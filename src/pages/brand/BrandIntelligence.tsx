import { useEffect, useState, type ReactNode, type CSSProperties } from 'react';
import { useParams, Navigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Tabs';
import { useBrand } from '@/context/BrandContext';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { useAsyncData, LoadingState, ErrorState } from '@/hooks/useAsyncData';
import { HelpTip } from '@/components/ui/HelpTip';
import { VersionHistoryList } from '@/pages/brand/knowledge-version-ui';
import { BrandAssetLibrary } from '@/pages/brand/BrandAssetLibrary';
import type {
  BrandRule, BrandAudience, BrandPersona, BrandChannel, BrandVisual,
  BrandKeyword, BrandExample, BrandDocument, BrandVersion, VerificationStatus,
  BrandAsset, PressCoverage, PressRelease, DiscoveredPressItem,
  BrandImagePrompt, BrandRuleType,
} from '@/types';

const TABS = [
  { id: 'core', label: '品牌核心', hint: '品牌怎麼介紹自己、最近想聊什麼、常用句子與 Hashtag。小編改完按各區塊儲存即可。' },
  { id: 'audience', label: '受眾', hint: '這品牌在對誰說話。B 端是業者、C 端是一般使用者。產文會照這裡的痛點寫。' },
  { id: 'channel', label: '平台調性', hint: 'FB、IG、Threads 各平台語氣、字數，以及一篇要帶幾則 Hashtag。' },
  { id: 'rules', label: '規則邊界', hint: '能講什麼、不能講什麼。AI 產文會遵守，避免發明數字或保證成效。' },
  { id: 'press', label: '媒體報導', hint: '已見報的新聞。可引用媒體名與事實，不可把轉載算成多次專訪。' },
  { id: 'releases', label: '新聞稿', hint: '品牌自己發的新聞稿，可再轉成官網長文。' },
  { id: 'collateral', label: 'EDM／簡報', hint: '上傳 DM、簡報給小編與產文參考，也可用在客戶 LINE 資訊包。' },
  { id: 'visual', label: '視覺', hint: '色票、圖卡尺寸等視覺規定，產圖時會對齊。' },
  { id: 'image-prompt', label: '產圖 Prompt', hint: '直接改生圖風格。不用等工程師改程式。' },
  { id: 'library', label: '素材庫', hint: '真實品牌素材。系統畫面請標角色與功能；AI 只會預設使用「現行」素材。' },
  { id: 'raw', label: '原始檢視', hint: '系統彙整後的唯讀全文，方便核對，不要當編輯區。' },
];

const PLATFORM_LABEL: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  threads: 'Threads',
  website: '官網長文',
};

const CHANNEL_HASHTAG_HINT: Record<string, string> = {
  instagram: 'IG 一篇通常 8 到 12 則，放在文末。',
  facebook: 'FB 一篇通常 2 到 3 則就好，太多像廣告。',
  threads: 'Threads 通常 0 到 5 則，生活文可以更少。',
  website: '官網長文一般不放 Hashtag。',
};

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

export function BrandIntelligence() {
  const { brand: slug } = useParams();
  const { brandBySlug, brandsLoading } = useBrand();
  const { user } = useAuth();
  const canEdit = user?.role !== 'viewer';
  const canPublish = user?.role === 'super_admin' || user?.role === 'brand_manager' || user?.role === 'brand_editor';
  const brand = slug ? brandBySlug(slug) : undefined;
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = TABS.some((t) => t.id === searchParams.get('tab')) ? searchParams.get('tab')! : 'core';
  const [tab, setTab] = useState(initialTab);
  const [rules, setRules] = useState<BrandRule[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [assets, setAssets] = useState<BrandAsset[]>([]);
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
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docTitle, setDocTitle] = useState('');
  const [docNotes, setDocNotes] = useState('');
  const [docKind, setDocKind] = useState<'dm' | 'presentation'>('dm');
  const [docUploading, setDocUploading] = useState(false);
  const [docBusyId, setDocBusyId] = useState<string | null>(null);
  const [docMessage, setDocMessage] = useState<string | null>(null);
  const [documents, setDocuments] = useState<BrandDocument[]>([]);
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [websiteNote, setWebsiteNote] = useState('');
  const [blogBaseUrl, setBlogBaseUrl] = useState('');
  const [ingestBaseUrl, setIngestBaseUrl] = useState('');
  const [ingestKey, setIngestKey] = useState('');
  const [hasIngestKey, setHasIngestKey] = useState(false);
  const [ingestTesting, setIngestTesting] = useState(false);
  const [websiteSaving, setWebsiteSaving] = useState(false);
  const [websiteMessage, setWebsiteMessage] = useState<string | null>(null);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [customerHint, setCustomerHint] = useState('');
  const [lineMessage, setLineMessage] = useState('');
  const [lineFiles, setLineFiles] = useState<{ title: string; kind: string; url: string }[]>([]);
  const [lineBusy, setLineBusy] = useState(false);
  const [imagePrompts, setImagePrompts] = useState<BrandImagePrompt[]>([]);
  const [promptDrafts, setPromptDrafts] = useState<Record<string, string>>({});
  const [promptBusy, setPromptBusy] = useState<string | null>(null);
  const [promptMessage, setPromptMessage] = useState<string | null>(null);
  const [tagline, setTagline] = useState('');
  const [audiences, setAudiences] = useState<BrandAudience[]>([]);
  const [personas, setPersonas] = useState<BrandPersona[]>([]);
  const [channels, setChannels] = useState<BrandChannel[]>([]);
  const [visuals, setVisuals] = useState<BrandVisual[]>([]);
  const [keywords, setKeywords] = useState<BrandKeyword[]>([]);
  const [examples, setExamples] = useState<BrandExample[]>([]);
  const [newKeyword, setNewKeyword] = useState('');
  const [newKeywordCat, setNewKeywordCat] = useState<BrandKeyword['category']>('key_message');
  const [versions, setVersions] = useState<BrandVersion[]>([]);
  const [draftVersion, setDraftVersion] = useState<BrandVersion | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [publishNote, setPublishNote] = useState('');
  const [versionBusy, setVersionBusy] = useState(false);
  const [versionMessage, setVersionMessage] = useState<string | null>(null);
  const [saveBusy, setSaveBusy] = useState<string | null>(null);
  const [ruleDrafts, setRuleDrafts] = useState<Record<string, Partial<BrandRule>>>({});

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
  useEffect(() => {
    if (intelQuery.data?.documents) setDocuments(intelQuery.data.documents);
  }, [intelQuery.data?.documents]);
  useEffect(() => {
    const list = intelQuery.data?.imagePrompts;
    if (!list?.length) return;
    setImagePrompts(list);
    setPromptDrafts(Object.fromEntries(list.map((p) => [p.slot, p.prompt])));
  }, [intelQuery.data?.imagePrompts]);
  useEffect(() => {
    if (tab !== 'image-prompt' || !slug || imagePrompts.length) return;
    api.brandImagePrompts(slug).then(({ prompts }) => {
      setImagePrompts(prompts);
      setPromptDrafts(Object.fromEntries(prompts.map((p) => [p.slot, p.prompt])));
    }).catch(() => undefined);
  }, [tab, slug, imagePrompts.length]);
  useEffect(() => {
    const intel = intelQuery.data;
    if (!intel) return;
    setAudiences((intel.audiences ?? []).map((a) => ({ ...a, painPoints: Array.isArray(a.painPoints) ? a.painPoints : [] })));
    setPersonas((intel.personas ?? []).map((p) => ({ ...p, painPoints: Array.isArray(p.painPoints) ? p.painPoints : [] })));
    setChannels(intel.channels ?? []);
    setVisuals(intel.visuals ?? []);
    setKeywords(intel.keywords ?? []);
    setExamples(intel.examples ?? []);
    const list = intel.versions ?? [];
    setVersions(list);
    setDraftVersion(list.find((v) => v.status === 'draft') ?? null);
  }, [intelQuery.data]);
  useEffect(() => {
    const b = brandQuery.data?.brand;
    if (!b) return;
    setTagline(b.tagline ?? '');
    setWebsiteUrl(b.websiteUrl ?? '');
    setWebsiteNote(b.websiteNote ?? '');
    setBlogBaseUrl(b.blogBaseUrl ?? '');
    setIngestBaseUrl(b.ingestBaseUrl ?? '');
    setHasIngestKey(Boolean(b.hasIngestKey));
    setIngestKey('');
  }, [brandQuery.data?.brand]);

  if (!brand) return brandsLoading ? <LoadingState /> : <Navigate to="/" replace />;
  if (brandQuery.loading || intelQuery.loading) return <LoadingState />;
  if (brandQuery.error || intelQuery.error) {
    return <ErrorState message={brandQuery.error ?? intelQuery.error ?? '載入失敗'} onRetry={() => { brandQuery.reload(); intelQuery.reload(); }} />;
  }

  const version = brandQuery.data?.version as BrandVersion | null | undefined;
  const isCollateralDoc = (d: BrandDocument) => (
    d.sourceType === 'dm' || d.sourceType === 'presentation'
    || ((d.sourceType === 'pdf' || d.sourceType === 'image') && !!d.fileName)
  );
  const collateralKindText = (d: BrandDocument) => (d.sourceType === 'presentation' ? '簡報' : 'EDM');
  const seedDocuments = documents.filter((d) => !isCollateralDoc(d));
  const collaterals = documents.filter(isCollateralDoc);
  const pillars = examples.filter((e) => e.category === 'content_pillar');
  const hotTopics = examples.filter((e) => e.category === 'hot_topic_bank');

  function applyVersionPayload(payload: { draft?: BrandVersion | null; versions?: BrandVersion[] }) {
    if (payload.versions) {
      setVersions(payload.versions);
      setDraftVersion(payload.versions.find((v) => v.status === 'draft') ?? payload.draft ?? null);
    } else if (payload.draft !== undefined) {
      setDraftVersion(payload.draft);
      if (payload.draft) {
        setVersions((prev) => {
          const others = prev.filter((v) => v.id !== payload.draft!.id && v.status !== 'draft');
          return [payload.draft!, ...others];
        });
      }
    }
  }

  async function saveKnowledge(body: Parameters<typeof api.saveBrandKnowledge>[1]) {
    if (!slug) throw new Error('no slug');
    const res = await api.saveBrandKnowledge(slug, body);
    applyVersionPayload(res);
    setVersionMessage('已寫入草稿，發布後會留下這一版改了什麼');
    return res;
  }

  async function archiveRule(id: string) {
    const res = await saveKnowledge({ section: 'rule', action: 'delete', id });
    setRules((prev) => prev.filter((r) => r.id !== id));
    void res;
  }

  async function addRule() {
    const res = await saveKnowledge({
      section: 'rule',
      action: 'create',
      payload: { ruleType: 'marketing_rule', statement: '新規則(點擊編輯以填寫內容)', verification: 'pending' },
    });
    if (res.item) {
      const rule = res.item as unknown as BrandRule;
      setRules((prev) => [...prev, rule]);
      setEditingId(rule.id);
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
    setPressMessage('正在依序生成 FB / IG / Threads 草稿…');
    try {
      const res = await api.generateFromPressCoverage(slug, id);
      const fail = res.failures.length ? `；${res.failures.length} 則失敗` : '';
      setPressMessage(`已生成 ${res.created.length} 則社群草稿${fail},請到內容中心審閱`);
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
    setPressMessage('正在依序準備 FB / IG / Threads 素材…');
    try {
      const res = await api.generateFromPressRelease(slug, id);
      const fail = res.failures.length ? `；${res.failures.length} 則失敗` : '';
      setPressMessage(`已準備 ${res.created.length} 則社群素材(不會寫成已見報)${fail},請到內容中心審閱`);
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

  async function uploadCollateral() {
    if (!slug || !docFile) return;
    setDocUploading(true);
    setDocMessage(null);
    try {
      let result: { document: BrandDocument };
      try {
        result = await api.uploadBrandDocument(slug, {
          file: docFile, sourceType: docKind, title: docTitle.trim() || undefined, notes: docNotes.trim() || undefined,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : '';
        if (!/key_points|extract_status|document_source_type/i.test(msg)) throw e;
        setDocMessage('資料表尚未補齊欄位,正在自動更新…');
        await api.migrateDocuments();
        result = await api.uploadBrandDocument(slug, {
          file: docFile, sourceType: docKind, title: docTitle.trim() || undefined, notes: docNotes.trim() || undefined,
        });
      }
      setDocuments((prev) => [result.document, ...prev.filter((d) => d.id !== result.document.id)]);
      setDocFile(null);
      setDocTitle('');
      setDocNotes('');
      if (result.document.extractStatus === 'ready') {
        setDocMessage('已上傳並抽出賣點,之後排程與手動生成都會參考這份內容');
      } else {
        setDocMessage('已存檔,正在背景抽出賣點。大份簡報大約半分鐘,完成後即可生成貼文。');
        void (async () => {
          for (let i = 0; i < 16; i++) {
            await new Promise((r) => setTimeout(r, 2500));
            try {
              const next = await api.listBrandDocuments(slug);
              setDocuments(next.documents);
              const row = next.documents.find((d) => d.id === result.document.id);
              if (row && row.extractStatus !== 'pending') {
                setDocMessage(row.extractStatus === 'ready'
                  ? '已抽出賣點,之後排程與手動生成都會參考這份內容'
                  : (row.rawContent || '已存檔,但文字抽出失敗。可補說明後再產出 LINE 訊息。'));
                return;
              }
            } catch { /* 輪詢失敗就等使用者自己重整 */ }
          }
        })();
      }
    } catch (e) {
      setDocMessage(e instanceof Error ? e.message : '上傳失敗');
    } finally {
      setDocUploading(false);
    }
  }

  async function deleteCollateral(id: string) {
    if (!slug) return;
    setDocBusyId(id);
    setDocMessage(null);
    try {
      await api.deleteBrandDocument(slug, id);
      setDocuments((prev) => prev.filter((d) => d.id !== id));
    } catch (e) {
      setDocMessage(e instanceof Error ? e.message : '刪除失敗');
    } finally {
      setDocBusyId(null);
    }
  }

  async function saveWebsite() {
    if (!slug) return;
    setWebsiteSaving(true);
    setWebsiteMessage(null);
    try {
      const { brand: saved } = await api.updateBrand(slug, {
        websiteUrl: websiteUrl.trim() || null,
        websiteNote: websiteNote.trim() || null,
        blogBaseUrl: blogBaseUrl.trim() || null,
        ingestBaseUrl: ingestBaseUrl.trim() || null,
        ingestKey: ingestKey.trim() || undefined,
      });
      setWebsiteUrl(saved.websiteUrl ?? '');
      setWebsiteNote(saved.websiteNote ?? '');
      setBlogBaseUrl(saved.blogBaseUrl ?? '');
      setIngestBaseUrl(saved.ingestBaseUrl ?? '');
      setHasIngestKey(Boolean(saved.hasIngestKey) || hasIngestKey || Boolean(ingestKey.trim()));
      setIngestKey('');
      setWebsiteMessage('已寫入品牌資訊與官網長文目的地，並記入草稿');
      if (slug) {
        api.brandVersions(slug).then((res) => applyVersionPayload(res)).catch(() => undefined);
      }
    } catch (e) {
      setWebsiteMessage(e instanceof Error ? e.message : '官網儲存失敗');
    } finally {
      setWebsiteSaving(false);
    }
  }

  async function testIngest() {
    if (!slug) return;
    setIngestTesting(true);
    setWebsiteMessage(null);
    try {
      if (ingestKey.trim() || blogBaseUrl.trim() || ingestBaseUrl.trim()) {
        await api.updateBrand(slug, {
          websiteUrl: websiteUrl.trim() || null,
          websiteNote: websiteNote.trim() || null,
          blogBaseUrl: blogBaseUrl.trim() || null,
          ingestBaseUrl: ingestBaseUrl.trim() || null,
          ingestKey: ingestKey.trim() || undefined,
        });
        if (ingestKey.trim()) {
          setHasIngestKey(true);
          setIngestKey('');
        }
      }
      const res = await api.testWebsiteIngest(slug);
      setWebsiteMessage(res.message);
    } catch (e) {
      setWebsiteMessage(e instanceof Error ? e.message : '連線測試失敗');
    } finally {
      setIngestTesting(false);
    }
  }

  function toggleDoc(id: string) {
    setSelectedDocIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function composeLinePack() {
    if (!slug) return;
    setLineBusy(true);
    setDocMessage(null);
    try {
      const res = await api.composeCustomerLineMessage(slug, {
        documentIds: selectedDocIds.length ? selectedDocIds : undefined,
        customerHint: customerHint.trim() || undefined,
      });
      setLineMessage(res.message);
      setLineFiles(res.files);
      setDocMessage('已產出給客戶的 LINE 訊息,可直接複製貼上');
    } catch (e) {
      setDocMessage(e instanceof Error ? e.message : 'LINE 訊息產出失敗');
    } finally {
      setLineBusy(false);
    }
  }

  async function copyLineMessage() {
    if (!lineMessage) return;
    try {
      await navigator.clipboard.writeText(lineMessage);
      setDocMessage('已複製到剪貼簿,可直接貼到 LINE');
    } catch {
      setDocMessage('瀏覽器無法自動複製,請手動選取文字');
    }
  }

  async function createDraft() {
    if (!slug) return;
    setVersionBusy(true);
    setVersionMessage(null);
    try {
      const res = await api.createBrandDraft(slug);
      applyVersionPayload(res);
      setShowHistory(true);
      setVersionMessage('已建立草稿。各分頁改完會記在這一版，再按發布。');
    } catch (e) {
      setVersionMessage(e instanceof Error ? e.message : '建立草稿失敗');
    } finally {
      setVersionBusy(false);
    }
  }

  async function publishVersion() {
    if (!slug) return;
    setVersionBusy(true);
    setVersionMessage(null);
    try {
      const res = await api.publishBrandVersion(slug, publishNote.trim() || undefined);
      applyVersionPayload({ draft: null, versions: res.versions });
      setDraftVersion(null);
      setPublishNote('');
      setShowHistory(true);
      setVersionMessage(`已發布 v${res.published.versionNumber}，之後生成文案會用這一版`);
      brandQuery.reload();
    } catch (e) {
      setVersionMessage(e instanceof Error ? e.message : '發布失敗');
    } finally {
      setVersionBusy(false);
    }
  }

  async function generateFromCollateral(id: string) {
    if (!slug) return;
    setDocBusyId(id);
    setDocMessage(null);
    try {
      const res = await api.generateFromBrandDocument(slug, id);
      const fail = res.failures.length ? `, ${res.failures.length} 則失敗` : '';
      setDocMessage(`已生成 ${res.created.length} 則社群草稿${fail},請到內容中心審閱`);
    } catch (e) {
      setDocMessage(e instanceof Error ? e.message : '生成失敗');
    } finally {
      setDocBusyId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title={`${brand.name} 品牌智慧`}
        subtitle="小編可直接改各分頁。存檔立刻生效並記入草稿；發布後會留下這版改了哪些。"
        actions={
          <>
            <Badge tone="primary">已發布 v{version?.versionNumber ?? '-'}</Badge>
            {draftVersion && (
              <Badge tone="accent">草稿 v{draftVersion.versionNumber} · {(draftVersion.changeLog ?? []).length} 項未發布</Badge>
            )}
            <Button variant="ghost" onClick={() => setShowHistory((v) => !v)}>
              {showHistory ? '收合版本' : '歷史版本'}
            </Button>
            {canEdit && !draftVersion && (
              <Button variant="secondary" disabled={versionBusy} onClick={() => void createDraft()}>
                {versionBusy ? '建立中…' : '建立草稿並編輯'}
              </Button>
            )}
            {canPublish && draftVersion && (
              <Button variant="primary" disabled={versionBusy} onClick={() => void publishVersion()}>
                {versionBusy ? '發布中…' : '發布這個版本'}
              </Button>
            )}
          </>
        }
      />

      {(showHistory || draftVersion || versionMessage) && (
        <Card style={{ marginBottom: 16, display: 'grid', gap: 12 }}>
          <p style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--color-text-muted)', margin: 0 }}>
            品牌小編可直接改各分頁條目。存檔會立刻給之後的發文用，並記入草稿；發布後會留下「改了哪些」的版本紀錄。
          </p>
          {canPublish && draftVersion && (
            <div style={{ display: 'grid', gap: 8 }}>
              <input
                placeholder="這版調整重點（選填，會寫進版本摘要）"
                value={publishNote}
                onChange={(e) => setPublishNote(e.target.value)}
                style={inputStyle}
              />
            </div>
          )}
          {versionMessage && <p style={{ fontSize: 13, margin: 0 }}>{versionMessage}</p>}
          {showHistory && <VersionHistoryList versions={versions} />}
        </Card>
      )}

      <Card style={{ padding: 0 }}>
        <div style={{ padding: '4px 16px 0' }}>
          <Tabs tabs={TABS} active={tab} onChange={(next) => {
            setTab(next);
            setSearchParams(next === 'core' ? {} : { tab: next }, { replace: true });
          }} />
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
                  <Field label="這品牌一句話怎麼說" hint="給第一次聽到這品牌的人看。之後貼文、官網、SEO 都會用這句當定位。">
                    <div style={{ display: 'grid', gap: 8 }}>
                      <textarea
                        value={tagline}
                        onChange={(e) => setTagline(e.target.value)}
                        rows={3}
                        disabled={!canEdit}
                        style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.55 }}
                      />
                      {canEdit && (
                        <Button
                          variant="secondary"
                          style={{ justifySelf: 'start' }}
                          disabled={saveBusy === 'tagline'}
                          onClick={async () => {
                            setSaveBusy('tagline');
                            setVersionMessage(null);
                            try {
                              await saveKnowledge({ section: 'core', action: 'update', payload: { tagline } });
                              brandQuery.reload();
                            } catch (e) {
                              setVersionMessage(e instanceof Error ? e.message : '儲存失敗');
                            } finally {
                              setSaveBusy(null);
                            }
                          }}
                        >
                          {saveBusy === 'tagline' ? '儲存中…' : '儲存定位'}
                        </Button>
                      )}
                    </div>
                  </Field>
                  <Field label="官方網站" hint="產品入口網址。客戶 LINE 資訊包與品牌資料會帶到這裡。">
                    <div style={{ display: 'grid', gap: 8 }}>
                      <input
                        placeholder="https:// 產品入口（指揮中心 / app）"
                        value={websiteUrl}
                        onChange={(e) => setWebsiteUrl(e.target.value)}
                        style={inputStyle}
                      />
                      <input
                        placeholder="官網說明(選填,例如:產品介紹與方案以官網為準)"
                        value={websiteNote}
                        onChange={(e) => setWebsiteNote(e.target.value)}
                        style={inputStyle}
                      />
                    </div>
                  </Field>
                  <Field label="官網文章要發到哪" hint="公開部落格網域、對方 ingest 網址與金鑰。產完 SEO 長文批准後會送到這裡上架。">
                    <div style={{ display: 'grid', gap: 8 }}>
                      <input
                        placeholder="公開網域，例如 https://washgo.com.tw"
                        value={blogBaseUrl}
                        onChange={(e) => setBlogBaseUrl(e.target.value)}
                        style={inputStyle}
                      />
                      <input
                        placeholder="ingest API，例如 https://washgo-api.washgotaskgo.workers.dev"
                        value={ingestBaseUrl}
                        onChange={(e) => setIngestBaseUrl(e.target.value)}
                        style={inputStyle}
                      />
                      <input
                        type="password"
                        autoComplete="new-password"
                        placeholder={hasIngestKey ? '已儲存金鑰，留空則不改' : 'X-Go-Marketing-Key（對方提供）'}
                        value={ingestKey}
                        onChange={(e) => setIngestKey(e.target.value)}
                        style={inputStyle}
                      />
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <Button variant="secondary" style={{ justifySelf: 'start' }} disabled={websiteSaving} onClick={() => void saveWebsite()}>
                          {websiteSaving ? '儲存中…' : '儲存官網資訊'}
                        </Button>
                        <Button variant="secondary" disabled={ingestTesting || websiteSaving} onClick={() => void testIngest()}>
                          {ingestTesting ? '測試中…' : '測試 ingest 連線'}
                        </Button>
                      </div>
                      {websiteMessage && <p style={{ fontSize: 12, color: 'var(--color-primary-dark)', margin: 0 }}>{websiteMessage}</p>}
                    </div>
                  </Field>
                  <Field label="平常主要在講哪幾類" hint="例如痛點、產品怎麼用、現場故事。右邊數字是這類大約佔幾成，加起來接近 100 即可。">
                    <div style={{ display: 'grid', gap: 10 }}>
                      {pillars.map((p) => (
                        <ExampleEditor
                          key={p.id}
                          item={p}
                          busy={saveBusy === p.id}
                          canEdit={canEdit}
                          onChange={(next) => setExamples((prev) => prev.map((x) => (x.id === p.id ? next : x)))}
                          onSave={async (item) => {
                            setSaveBusy(item.id);
                            try {
                              const res = await saveKnowledge({
                                section: 'example', action: 'update', id: item.id,
                                payload: { title: item.title, body: item.body, weightPercent: item.weightPercent, category: item.category },
                              });
                              if (res.item) setExamples((prev) => prev.map((x) => (x.id === item.id ? res.item as unknown as BrandExample : x)));
                            } catch (e) {
                              setVersionMessage(e instanceof Error ? e.message : '儲存失敗');
                              throw e;
                            } finally {
                              setSaveBusy(null);
                            }
                          }}
                          onDelete={async (id) => {
                            setSaveBusy(id);
                            try {
                              await saveKnowledge({ section: 'example', action: 'delete', id });
                              setExamples((prev) => prev.filter((x) => x.id !== id));
                            } catch (e) {
                              setVersionMessage(e instanceof Error ? e.message : '刪除失敗');
                            } finally {
                              setSaveBusy(null);
                            }
                          }}
                        />
                      ))}
                      {canEdit && (
                        <Button
                          variant="secondary"
                          style={{ justifySelf: 'start' }}
                          disabled={saveBusy === 'new-pillar'}
                          onClick={async () => {
                            setSaveBusy('new-pillar');
                            try {
                              const res = await saveKnowledge({
                                section: 'example', action: 'create',
                                payload: { category: 'content_pillar', title: '新內容支柱', body: '', weightPercent: 0 },
                              });
                              if (res.item) setExamples((prev) => [...prev, res.item as unknown as BrandExample]);
                            } catch (e) {
                              setVersionMessage(e instanceof Error ? e.message : '新增失敗');
                            } finally {
                              setSaveBusy(null);
                            }
                          }}
                        >
                          + 新增支柱
                        </Button>
                      )}
                    </div>
                  </Field>
                  <Field label="最近想發的主題" hint="寫主題名稱，下面寫小編該怎麼切入。存檔後，產文比較會聊這些題，而不是每次都同一套。">
                    <div style={{ display: 'grid', gap: 10 }}>
                      {hotTopics.map((h) => (
                        <ExampleEditor
                          key={h.id}
                          item={h}
                          hideWeight
                          busy={saveBusy === h.id}
                          canEdit={canEdit}
                          onChange={(next) => setExamples((prev) => prev.map((x) => (x.id === h.id ? next : x)))}
                          onSave={async (item) => {
                            setSaveBusy(item.id);
                            try {
                              const res = await saveKnowledge({
                                section: 'example', action: 'update', id: item.id,
                                payload: { title: item.title, body: item.body, category: item.category || 'hot_topic_bank' },
                              });
                              if (res.item) setExamples((prev) => prev.map((x) => (x.id === item.id ? { ...(res.item as unknown as BrandExample), category: 'hot_topic_bank' } : x)));
                            } catch (e) {
                              setVersionMessage(e instanceof Error ? e.message : '儲存失敗');
                              throw e;
                            } finally {
                              setSaveBusy(null);
                            }
                          }}
                          onDelete={async (id) => {
                            setSaveBusy(id);
                            try {
                              await saveKnowledge({ section: 'example', action: 'delete', id });
                              setExamples((prev) => prev.filter((x) => x.id !== id));
                            } catch (e) {
                              setVersionMessage(e instanceof Error ? e.message : '刪除失敗');
                            } finally {
                              setSaveBusy(null);
                            }
                          }}
                        />
                      ))}
                      {canEdit && (
                        <Button
                          variant="secondary"
                          style={{ justifySelf: 'start' }}
                          disabled={saveBusy === 'new-topic'}
                          onClick={async () => {
                            setSaveBusy('new-topic');
                            try {
                              const res = await saveKnowledge({
                                section: 'example', action: 'create',
                                payload: { category: 'hot_topic_bank', title: '新熱點主題', body: '' },
                              });
                              if (res.item) setExamples((prev) => [...prev, res.item as unknown as BrandExample]);
                            } catch (e) {
                              setVersionMessage(e instanceof Error ? e.message : '新增失敗');
                            } finally {
                              setSaveBusy(null);
                            }
                          }}
                        >
                          + 新增熱點
                        </Button>
                      )}
                    </div>
                  </Field>
                  <Field label="常講的句子、Hashtag、行動呼籲" hint="關鍵訊息是品牌常講的一句話。Hashtag 是 #標籤。CTA 是文末要人做的事，例如來電或來看官網。">
                    <div style={{ display: 'grid', gap: 10 }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {keywords.map((k) => (
                          <span key={k.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <Badge tone={k.category === 'hashtag' ? 'primary' : k.category === 'cta' ? 'accent' : 'default'}>
                              {k.value}
                            </Badge>
                            {canEdit && (
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await saveKnowledge({ section: 'keyword', action: 'delete', id: k.id });
                                    setKeywords((prev) => prev.filter((x) => x.id !== k.id));
                                  } catch (e) {
                                    setVersionMessage(e instanceof Error ? e.message : '刪除失敗');
                                  }
                                }}
                                style={{ border: 0, background: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: 12 }}
                              >
                                刪
                              </button>
                            )}
                          </span>
                        ))}
                      </div>
                      {canEdit && (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <select value={newKeywordCat} onChange={(e) => setNewKeywordCat(e.target.value as BrandKeyword['category'])} style={inputStyle}>
                            <option value="key_message">關鍵訊息</option>
                            <option value="hashtag">Hashtag</option>
                            <option value="cta">CTA</option>
                          </select>
                          <input
                            value={newKeyword}
                            onChange={(e) => setNewKeyword(e.target.value)}
                            placeholder="例如 #包租代管，或一句行動呼籲"
                            style={{ ...inputStyle, minWidth: 180 }}
                          />
                          <Button
                            variant="secondary"
                            disabled={!newKeyword.trim() || saveBusy === 'keyword'}
                            onClick={async () => {
                              setSaveBusy('keyword');
                              try {
                                const res = await saveKnowledge({
                                  section: 'keyword', action: 'create',
                                  payload: { category: newKeywordCat, value: newKeyword.trim() },
                                });
                                if (res.item) setKeywords((prev) => [...prev, res.item as unknown as BrandKeyword]);
                                setNewKeyword('');
                              } catch (e) {
                                setVersionMessage(e instanceof Error ? e.message : '新增失敗');
                              } finally {
                                setSaveBusy(null);
                              }
                            }}
                          >
                            新增
                          </Button>
                        </div>
                      )}
                    </div>
                  </Field>
                </div>
              )}

              {tab === 'audience' && (
                <div style={{ display: 'grid', gap: 16 }}>
                  <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0, lineHeight: 1.6 }}>
                    先寫這群人是誰、最煩什麼、我們用什麼角度說話。存檔後產文會照這裡寫。
                  </p>
                  <div className="grid-2" style={{ gap: 12 }}>
                    {audiences.map((a) => (
                      <div key={a.id} style={{ ...cardBoxStyle, display: 'grid', gap: 8 }}>
                        <label style={miniLabel}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>這群人是誰 <HelpTip text="例如自管房東、洗衣店主、工班頭。不要寫太抽象。" /></span>
                          <input value={a.name} disabled={!canEdit} onChange={(e) => setAudiences((prev) => prev.map((x) => (x.id === a.id ? { ...x, name: e.target.value } : x)))} style={inputStyle} />
                        </label>
                        <label style={miniLabel}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>B 端或 C 端 <HelpTip text="B 端是會付錢買系統的業者。C 端是會用服務的個人。" /></span>
                          <select
                          value={a.lane ?? ''}
                          disabled={!canEdit}
                          onChange={(e) => setAudiences((prev) => prev.map((x) => (x.id === a.id ? { ...x, lane: (e.target.value || null) as BrandAudience['lane'] } : x)))}
                          style={inputStyle}
                        >
                          <option value="">不分 B/C</option>
                          <option value="b2b">B 端（業者）</option>
                          <option value="b2c">C 端（使用者）</option>
                        </select>
                        </label>
                        <label style={miniLabel}>
                          <span>他們最煩什麼（一行一則）</span>
                        <textarea
                          value={(a.painPoints ?? []).join('\n')}
                          disabled={!canEdit}
                          placeholder="他們最煩什麼，一行一則"
                          onChange={(e) => setAudiences((prev) => prev.map((x) => (x.id === a.id ? { ...x, painPoints: e.target.value.split('\n') } : x)))}
                          rows={3}
                          style={{ ...inputStyle, resize: 'vertical' }}
                        />
                        </label>
                        <label style={miniLabel}>
                          <span>我們用什麼角度說話</span>
                        <textarea
                          value={a.appealAngle ?? ''}
                          disabled={!canEdit}
                          placeholder="例如：每天只看一眼的自動化"
                          onChange={(e) => setAudiences((prev) => prev.map((x) => (x.id === a.id ? { ...x, appealAngle: e.target.value } : x)))}
                          rows={2}
                          style={{ ...inputStyle, resize: 'vertical' }}
                        />
                        </label>
                        {canEdit && (
                          <div style={{ display: 'flex', gap: 8 }}>
                            <Button
                              variant="secondary"
                              disabled={saveBusy === a.id}
                              onClick={async () => {
                                setSaveBusy(a.id);
                                try {
                                  const res = await saveKnowledge({
                                    section: 'audience', action: 'update', id: a.id,
                                    payload: { name: a.name, painPoints: a.painPoints, appealAngle: a.appealAngle, lane: a.lane },
                                  });
                                  if (res.item) setAudiences((prev) => prev.map((x) => (x.id === a.id ? res.item as unknown as BrandAudience : x)));
                                } catch (e) {
                                  setVersionMessage(e instanceof Error ? e.message : '儲存失敗');
                                } finally {
                                  setSaveBusy(null);
                                }
                              }}
                            >
                              {saveBusy === a.id ? '儲存中…' : '儲存受眾'}
                            </Button>
                            <Button variant="danger" disabled={saveBusy === a.id} onClick={async () => {
                              try {
                                await saveKnowledge({ section: 'audience', action: 'delete', id: a.id });
                                setAudiences((prev) => prev.filter((x) => x.id !== a.id));
                              } catch (e) {
                                setVersionMessage(e instanceof Error ? e.message : '刪除失敗');
                              }
                            }}>刪除</Button>
                          </div>
                        )}
                      </div>
                    ))}
                    {personas.map((p) => (
                      <div key={p.id} style={{ ...cardBoxStyle, display: 'grid', gap: 8 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: 8 }}>
                          <input value={p.code ?? ''} disabled={!canEdit} placeholder="P1" onChange={(e) => setPersonas((prev) => prev.map((x) => (x.id === p.id ? { ...x, code: e.target.value } : x)))} style={inputStyle} />
                          <input value={p.name} disabled={!canEdit} onChange={(e) => setPersonas((prev) => prev.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)))} style={inputStyle} />
                        </div>
                        <input value={p.ageRange ?? ''} disabled={!canEdit} placeholder="年齡層" onChange={(e) => setPersonas((prev) => prev.map((x) => (x.id === p.id ? { ...x, ageRange: e.target.value } : x)))} style={inputStyle} />
                        <textarea
                          value={(p.painPoints ?? []).join('\n')}
                          disabled={!canEdit}
                          placeholder="痛點，一行一則"
                          onChange={(e) => setPersonas((prev) => prev.map((x) => (x.id === p.id ? { ...x, painPoints: e.target.value.split('\n') } : x)))}
                          rows={3}
                          style={{ ...inputStyle, resize: 'vertical' }}
                        />
                        <textarea
                          value={p.appealAngle ?? ''}
                          disabled={!canEdit}
                          placeholder="訴求角度"
                          onChange={(e) => setPersonas((prev) => prev.map((x) => (x.id === p.id ? { ...x, appealAngle: e.target.value } : x)))}
                          rows={2}
                          style={{ ...inputStyle, resize: 'vertical' }}
                        />
                        {canEdit && (
                          <div style={{ display: 'flex', gap: 8 }}>
                            <Button
                              variant="secondary"
                              disabled={saveBusy === p.id}
                              onClick={async () => {
                                setSaveBusy(p.id);
                                try {
                                  const res = await saveKnowledge({
                                    section: 'persona', action: 'update', id: p.id,
                                    payload: { code: p.code, name: p.name, ageRange: p.ageRange, painPoints: p.painPoints, appealAngle: p.appealAngle, lane: p.lane },
                                  });
                                  if (res.item) setPersonas((prev) => prev.map((x) => (x.id === p.id ? res.item as unknown as BrandPersona : x)));
                                } catch (e) {
                                  setVersionMessage(e instanceof Error ? e.message : '儲存失敗');
                                } finally {
                                  setSaveBusy(null);
                                }
                              }}
                            >
                              {saveBusy === p.id ? '儲存中…' : '儲存 Persona'}
                            </Button>
                            <Button variant="danger" disabled={saveBusy === p.id} onClick={async () => {
                              try {
                                await saveKnowledge({ section: 'persona', action: 'delete', id: p.id });
                                setPersonas((prev) => prev.filter((x) => x.id !== p.id));
                              } catch (e) {
                                setVersionMessage(e instanceof Error ? e.message : '刪除失敗');
                              }
                            }}>刪除</Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {canEdit && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <Button variant="secondary" disabled={saveBusy === 'new-aud'} onClick={async () => {
                        setSaveBusy('new-aud');
                        try {
                          const res = await saveKnowledge({ section: 'audience', action: 'create', payload: { name: '新受眾', painPoints: [], appealAngle: '' } });
                          if (res.item) setAudiences((prev) => [...prev, res.item as unknown as BrandAudience]);
                        } catch (e) {
                          setVersionMessage(e instanceof Error ? e.message : '新增失敗');
                        } finally {
                          setSaveBusy(null);
                        }
                      }}>+ 新增受眾</Button>
                      <Button variant="secondary" disabled={saveBusy === 'new-per'} onClick={async () => {
                        setSaveBusy('new-per');
                        try {
                          const res = await saveKnowledge({ section: 'persona', action: 'create', payload: { code: `P${personas.length + 1}`, name: '新 Persona', painPoints: [], appealAngle: '' } });
                          if (res.item) setPersonas((prev) => [...prev, res.item as unknown as BrandPersona]);
                        } catch (e) {
                          setVersionMessage(e instanceof Error ? e.message : '新增失敗');
                        } finally {
                          setSaveBusy(null);
                        }
                      }}>+ 新增 Persona</Button>
                    </div>
                  )}
                </div>
              )}

              {tab === 'channel' && (
                <div className="grid-2" style={{ gap: 12 }}>
                  {channels.map((c) => (
                    <div key={c.id} style={{ ...cardBoxStyle, display: 'grid', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Badge tone="primary">{PLATFORM_LABEL[c.platform] ?? c.platform}</Badge>
                        <HelpTip text={`${PLATFORM_LABEL[c.platform] ?? c.platform} 產文會照這張卡的語氣、長度與 Hashtag 則數。改完按「儲存這平台」。`} />
                      </div>
                      <label style={miniLabel}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          說話語氣
                          <HelpTip text="這平台聽起來像誰在講話。例如 IG 生活感、FB 把故事講完、Threads 口語短句。" />
                        </span>
                        <textarea value={c.toneOfVoice ?? ''} disabled={!canEdit} placeholder="例如：口語、短、敢聊現場" rows={3} onChange={(e) => setChannels((prev) => prev.map((x) => (x.id === c.id ? { ...x, toneOfVoice: e.target.value } : x)))} style={{ ...inputStyle, resize: 'vertical' }} />
                      </label>
                      <label style={miniLabel}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          建議長度
                          <HelpTip text="一篇大概寫多長。例如 IG 80–180 字、FB 長文、Threads 1–3 段。" />
                        </span>
                        <input value={c.lengthGuideline ?? ''} disabled={!canEdit} placeholder="例如：80-180字，前 125 字要完整" onChange={(e) => setChannels((prev) => prev.map((x) => (x.id === c.id ? { ...x, lengthGuideline: e.target.value } : x)))} style={inputStyle} />
                      </label>
                      <label style={miniLabel}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          版型與格式
                          <HelpTip text="圖怎麼排、文怎麼收尾。例如 IG 4:5 痛點海報、Threads 結尾留一句好回的話。" />
                        </span>
                        <textarea value={c.formatGuideline ?? ''} disabled={!canEdit} placeholder="例如：4:5 痛點海報 + 現場畫面" rows={2} onChange={(e) => setChannels((prev) => prev.map((x) => (x.id === c.id ? { ...x, formatGuideline: e.target.value } : x)))} style={{ ...inputStyle, resize: 'vertical' }} />
                      </label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <label style={miniLabel}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            最少幾則 Hashtag
                            <HelpTip text={`產文時至少帶幾則 #。${CHANNEL_HASHTAG_HINT[c.platform] ?? '依平台習慣填。'} 左邊是最少，右邊是最多。`} />
                          </span>
                          <input type="number" min={0} max={30} value={c.hashtagCountMin ?? 0} disabled={!canEdit} onChange={(e) => setChannels((prev) => prev.map((x) => (x.id === c.id ? { ...x, hashtagCountMin: Number(e.target.value) } : x)))} style={inputStyle} />
                        </label>
                        <label style={miniLabel}>
                          <span>最多幾則 Hashtag</span>
                          <input type="number" min={0} max={30} value={c.hashtagCountMax ?? 0} disabled={!canEdit} onChange={(e) => setChannels((prev) => prev.map((x) => (x.id === c.id ? { ...x, hashtagCountMax: Number(e.target.value) } : x)))} style={inputStyle} />
                        </label>
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0, lineHeight: 1.5 }}>
                        {CHANNEL_HASHTAG_HINT[c.platform] ?? 'Hashtag 則數是產文時要帶幾個 #，不是字數。'}
                      </p>
                      {canEdit && (
                        <Button
                          type="button"
                          variant="secondary"
                          style={{ justifySelf: 'start' }}
                          disabled={saveBusy === c.id}
                          onClick={async () => {
                            setSaveBusy(c.id);
                            try {
                              const res = await saveKnowledge({
                                section: 'channel', action: 'update', id: c.id,
                                payload: { toneOfVoice: c.toneOfVoice, lengthGuideline: c.lengthGuideline, formatGuideline: c.formatGuideline, hashtagCountMin: c.hashtagCountMin, hashtagCountMax: c.hashtagCountMax },
                              });
                              if (res.item) setChannels((prev) => prev.map((x) => (x.id === c.id ? res.item as unknown as BrandChannel : x)));
                            } catch (e) {
                              setVersionMessage(e instanceof Error ? e.message : '儲存失敗');
                            } finally {
                              setSaveBusy(null);
                            }
                          }}
                        >
                          {saveBusy === c.id ? '儲存中…' : '儲存這平台'}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {tab === 'rules' && (
                <div style={{ display: 'grid', gap: 10 }}>
                  {rules.map((r) => {
                    const meta = ruleTypeLabel[r.ruleType] ?? { label: r.ruleType, tone: 'default' as BadgeTone };
                    const draft = { ...r, ...ruleDrafts[r.id] };
                    const isEditing = editingId === r.id;
                    return (
                      <motion.div key={r.id} layout style={{ ...cardBoxStyle, display: 'grid', gap: 8 }}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <Badge tone={meta.tone}>{meta.label}</Badge>
                          <Badge tone={verificationTone[r.verification]}>{verificationLabel[r.verification]}</Badge>
                        </div>
                        {isEditing ? (
                          <>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                              <select
                                value={draft.ruleType}
                                onChange={(e) => setRuleDrafts((prev) => ({ ...prev, [r.id]: { ...prev[r.id], ruleType: e.target.value as BrandRuleType } }))}
                                style={inputStyle}
                              >
                                <option value="can_claim">可宣稱</option>
                                <option value="cannot_claim">不可宣稱</option>
                                <option value="marketing_rule">行銷規則</option>
                                <option value="negative_rule">負面表列</option>
                              </select>
                              <select
                                value={draft.verification}
                                onChange={(e) => setRuleDrafts((prev) => ({ ...prev, [r.id]: { ...prev[r.id], verification: e.target.value as VerificationStatus } }))}
                                style={inputStyle}
                              >
                                <option value="pending">待驗證</option>
                                <option value="claimed">行銷宣稱</option>
                                <option value="verified">已驗證</option>
                              </select>
                            </div>
                            <textarea
                              value={draft.statement}
                              onChange={(e) => setRuleDrafts((prev) => ({ ...prev, [r.id]: { ...prev[r.id], statement: e.target.value } }))}
                              rows={3}
                              style={{ ...inputStyle, resize: 'vertical' }}
                            />
                            <input
                              value={draft.conditionNote ?? ''}
                              placeholder="條件說明（選填）"
                              onChange={(e) => setRuleDrafts((prev) => ({ ...prev, [r.id]: { ...prev[r.id], conditionNote: e.target.value } }))}
                              style={inputStyle}
                            />
                          </>
                        ) : (
                          <>
                            <div style={{ fontSize: 14 }}>{r.statement}</div>
                            {r.conditionNote && <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>條件:{r.conditionNote}</div>}
                          </>
                        )}
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {canEdit && isEditing && (
                            <Button
                              variant="secondary"
                              disabled={saveBusy === r.id}
                              onClick={async () => {
                                setSaveBusy(r.id);
                                try {
                                  const res = await saveKnowledge({
                                    section: 'rule', action: 'update', id: r.id,
                                    payload: { statement: draft.statement, conditionNote: draft.conditionNote, verification: draft.verification, ruleType: draft.ruleType },
                                  });
                                  if (res.item) setRules((prev) => prev.map((x) => (x.id === r.id ? res.item as unknown as BrandRule : x)));
                                  setEditingId(null);
                                } catch (e) {
                                  setVersionMessage(e instanceof Error ? e.message : '儲存失敗');
                                } finally {
                                  setSaveBusy(null);
                                }
                              }}
                            >
                              {saveBusy === r.id ? '儲存中…' : '儲存規則'}
                            </Button>
                          )}
                          {canEdit && (
                            <Button variant="ghost" onClick={() => {
                              if (!isEditing) setRuleDrafts((prev) => ({ ...prev, [r.id]: r }));
                              setEditingId(isEditing ? null : r.id);
                            }}>
                              {isEditing ? '取消' : '編輯'}
                            </Button>
                          )}
                          {canEdit && (
                            <Button variant="danger" onClick={() => void archiveRule(r.id)}>刪除</Button>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                  {canEdit && (
                    <Button variant="secondary" style={{ justifySelf: 'start' }} onClick={() => void addRule()}>
                      + 新增規則
                    </Button>
                  )}
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
                    <div className="grid-2" style={{ gap: 8 }}>
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

              {tab === 'collateral' && (
                <div style={{ display: 'grid', gap: 16 }}>
                  <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0 }}>
                    每個品牌各自上傳 EDM 與產品簡報(PDF／PPT／PPTX)。抽出的賣點會寫進品牌智慧;客戶要資料時,可產出一則包含檔案連結與官方網站的 LINE 訊息。
                  </p>
                  {docMessage && <p style={{ fontSize: 13, color: 'var(--color-primary-dark)' }}>{docMessage}</p>}
                  <div style={{ ...cardBoxStyle, display: 'grid', gap: 8 }}>
                    <strong style={{ fontSize: 13 }}>產出給客戶的 LINE 訊息</strong>
                    <input
                      placeholder="客戶想了解什麼(選填,例如報價、導入流程、活動檔期)"
                      value={customerHint}
                      onChange={(e) => setCustomerHint(e.target.value)}
                      style={inputStyle}
                    />
                    <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0 }}>
                      勾選下方要附上的 EDM／簡報;都不勾就帶入全部。官網請先在「品牌核心」填好。
                    </p>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <Button variant="primary" disabled={lineBusy || (collaterals.length === 0 && !websiteUrl.trim())} onClick={() => void composeLinePack()}>
                        {lineBusy ? '產出中…' : '產出 LINE 訊息'}
                      </Button>
                      <Button variant="secondary" disabled={!lineMessage} onClick={() => void copyLineMessage()}>複製訊息</Button>
                    </div>
                    {lineMessage && (
                      <textarea readOnly value={lineMessage} style={{ ...inputStyle, minHeight: 220, whiteSpace: 'pre-wrap' }} />
                    )}
                    {lineFiles.length > 0 && (
                      <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                        附件連結:{lineFiles.map((f) => `${f.kind}《${f.title}》`).join('、')}
                      </div>
                    )}
                  </div>
                  <div style={{ ...cardBoxStyle, display: 'grid', gap: 8 }}>
                    <strong style={{ fontSize: 13 }}>上傳 EDM 或產品簡報</strong>
                    <div className="grid-2" style={{ gap: 8 }}>
                      <select value={docKind} onChange={(e) => setDocKind(e.target.value as 'dm' | 'presentation')} style={inputStyle}>
                        <option value="dm">EDM／傳單／活動海報</option>
                        <option value="presentation">產品簡報（PDF／PPT／PPTX）</option>
                      </select>
                      <input placeholder="標題(選填,空白則用檔名)" value={docTitle} onChange={(e) => setDocTitle(e.target.value)} style={inputStyle} />
                    </div>
                    <input
                      type="file"
                      accept={docKind === 'dm' ? 'image/*,.pdf' : '.pdf,.ppt,.pptx,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation'}
                      onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
                      style={{ fontSize: 12 }}
                    />
                    <input
                      placeholder="補充說明(選填,例如檔期 8/1–8/31、只給 B 端看)"
                      value={docNotes}
                      onChange={(e) => setDocNotes(e.target.value)}
                      style={inputStyle}
                    />
                    <Button variant="primary" style={{ justifySelf: 'start' }} disabled={!docFile || docUploading} onClick={() => void uploadCollateral()}>
                      {docUploading ? '上傳中…' : '+ 上傳並抽出賣點'}
                    </Button>
                    <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0 }}>
                      EDM 建議 JPG／PNG；簡報請上傳 PDF、PPT 或 PPTX。舊版 PPT／掃描檔若抽不出字,仍會存檔,可補說明後產出 LINE 訊息。單檔 40MB 以內。
                    </p>
                  </div>
                  {collaterals.map((d) => {
                    const isImage = !!d.mimeType?.startsWith('image/') && d.fileUrl;
                    return (
                      <div key={d.id} style={cardBoxStyle}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginRight: 4 }}>
                            <input type="checkbox" checked={selectedDocIds.includes(d.id)} onChange={() => toggleDoc(d.id)} />
                            附在 LINE
                          </label>
                          <Badge tone={d.sourceType === 'presentation' ? 'secondary' : 'primary'}>
                            {collateralKindText(d)}
                          </Badge>
                          <Badge tone={d.extractStatus === 'ready' ? 'primary' : d.extractStatus === 'failed' ? 'danger' : 'accent'}>
                            {d.extractStatus === 'ready' ? '已抽出賣點' : d.extractStatus === 'failed' ? '抽取失敗' : '處理中'}
                          </Badge>
                          {d.createdAt && <Badge tone="default">{new Date(d.createdAt).toLocaleDateString('zh-TW')}</Badge>}
                        </div>
                        <strong style={{ fontSize: 14 }}>{d.title}</strong>
                        {isImage && (
                          <img
                            src={d.fileUrl ?? ''}
                            alt={d.title}
                            style={{ width: '100%', maxHeight: 220, objectFit: 'contain', borderRadius: 8, marginTop: 8, background: 'var(--color-bg-soft)' }}
                          />
                        )}
                        {d.rawContent && (
                          <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 8, whiteSpace: 'pre-wrap' }}>{d.rawContent}</div>
                        )}
                        {(d.keyPoints ?? []).length > 0 && (
                          <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13 }}>
                            {(d.keyPoints ?? []).map((p) => <li key={p}>{p}</li>)}
                          </ul>
                        )}
                        {d.fileUrl && (
                          <a href={d.fileUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, display: 'inline-block', marginTop: 8 }}>
                            下載原檔 →
                          </a>
                        )}
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                          <Button
                            variant="secondary"
                            style={{ padding: '4px 10px', fontSize: 12 }}
                            disabled={docBusyId === d.id || d.extractStatus !== 'ready'}
                            onClick={() => void generateFromCollateral(d.id)}
                          >
                            {docBusyId === d.id ? '生成中…' : '用這份生成社群貼文'}
                          </Button>
                          <Button
                            variant="danger"
                            style={{ padding: '4px 10px', fontSize: 12 }}
                            disabled={docBusyId === d.id}
                            onClick={() => void deleteCollateral(d.id)}
                          >
                            刪除
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                  {collaterals.length === 0 && (
                    <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>這個品牌還沒有 EDM 或簡報。上傳後就能產出給客戶的 LINE 訊息,排程發文也會參考。</p>
                  )}
                </div>
              )}

              {tab === 'visual' && (
                <div className="grid-4" style={{ gap: 12 }}>
                  {visuals.map((v) => (
                    <div key={v.id} style={{ ...cardBoxStyle, display: 'grid', gap: 8 }}>
                      {v.category === 'color' && (
                        <div style={{ width: '100%', height: 40, borderRadius: 8, background: v.value, border: '1px solid var(--color-border)' }} />
                      )}
                      <input value={v.label} disabled={!canEdit} onChange={(e) => setVisuals((prev) => prev.map((x) => (x.id === v.id ? { ...x, label: e.target.value } : x)))} style={inputStyle} />
                      <input value={v.value} disabled={!canEdit} onChange={(e) => setVisuals((prev) => prev.map((x) => (x.id === v.id ? { ...x, value: e.target.value } : x)))} style={inputStyle} />
                      <select
                        value={v.category}
                        disabled={!canEdit}
                        onChange={(e) => setVisuals((prev) => prev.map((x) => (x.id === v.id ? { ...x, category: e.target.value as BrandVisual['category'] } : x)))}
                        style={inputStyle}
                      >
                        <option value="color">色票</option>
                        <option value="layout">版面</option>
                        <option value="typography">字體</option>
                      </select>
                      {canEdit && (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <Button
                            variant="secondary"
                            disabled={saveBusy === v.id}
                            onClick={async () => {
                              setSaveBusy(v.id);
                              try {
                                const res = await saveKnowledge({
                                  section: 'visual', action: 'update', id: v.id,
                                  payload: { label: v.label, value: v.value, category: v.category },
                                });
                                if (res.item) setVisuals((prev) => prev.map((x) => (x.id === v.id ? res.item as unknown as BrandVisual : x)));
                              } catch (e) {
                                setVersionMessage(e instanceof Error ? e.message : '儲存失敗');
                              } finally {
                                setSaveBusy(null);
                              }
                            }}
                          >
                            {saveBusy === v.id ? '儲存中…' : '儲存'}
                          </Button>
                          <Button variant="danger" onClick={async () => {
                            try {
                              await saveKnowledge({ section: 'visual', action: 'delete', id: v.id });
                              setVisuals((prev) => prev.filter((x) => x.id !== v.id));
                            } catch (e) {
                              setVersionMessage(e instanceof Error ? e.message : '刪除失敗');
                            }
                          }}>刪</Button>
                        </div>
                      )}
                    </div>
                  ))}
                  {visuals.length === 0 && <p>尚無視覺規範資料</p>}
                  {canEdit && (
                    <Button
                      variant="secondary"
                      style={{ alignSelf: 'start' }}
                      disabled={saveBusy === 'new-visual'}
                      onClick={async () => {
                        setSaveBusy('new-visual');
                        try {
                          const res = await saveKnowledge({
                            section: 'visual', action: 'create',
                            payload: { label: '新色票', value: '#0B2D5C', category: 'color' },
                          });
                          if (res.item) setVisuals((prev) => [...prev, res.item as unknown as BrandVisual]);
                        } catch (e) {
                          setVersionMessage(e instanceof Error ? e.message : '新增失敗');
                        } finally {
                          setSaveBusy(null);
                        }
                      }}
                    >
                      + 新增視覺項目
                    </Button>
                  )}
                  <p style={{ gridColumn: '1 / -1', fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4 }}>
                    發文產圖風格請到「產圖 Prompt」分頁自行調整，不必等系統管理員改程式。改完記得發布版本，才看得到這次動了哪些。
                  </p>
                </div>
              )}

              {tab === 'image-prompt' && (
                <div style={{ display: 'grid', gap: 16 }}>
                  <p style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--color-text-muted)' }}>
                    這裡列出這個品牌發文時實際用的產圖 Prompt。品牌主可以直接改、存檔，下一則 FB／IG／Threads 圖就會跟新風格走。
                    系統仍會自動補上「不要畫字、官方 logo 後製」等防呆，不必寫進這三段。
                  </p>
                  {(imagePrompts.length ? imagePrompts : []).map((item) => (
                    <div key={item.slot} style={{ ...cardBoxStyle, display: 'grid', gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
                        <strong>{item.title}</strong>
                        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                          {item.isCustom ? '已自訂' : '系統預設'}
                          {item.updatedAt ? ` · ${new Date(item.updatedAt).toLocaleString('zh-TW')}` : ''}
                        </span>
                      </div>
                      <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--color-text-muted)' }}>{item.hint}</p>
                      <textarea
                        value={promptDrafts[item.slot] ?? item.prompt}
                        onChange={(e) => setPromptDrafts((prev) => ({ ...prev, [item.slot]: e.target.value }))}
                        rows={item.slot === 'copy_spec' ? 8 : 14}
                        style={{ ...inputStyle, minHeight: item.slot === 'copy_spec' ? 160 : 240, resize: 'vertical', lineHeight: 1.55 }}
                      />
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <Button
                          variant="primary"
                          disabled={promptBusy === item.slot}
                          onClick={async () => {
                            if (!slug) return;
                            setPromptBusy(item.slot);
                            setPromptMessage(null);
                            try {
                              const { prompts, draft } = await api.saveBrandImagePrompt(slug, {
                                slot: item.slot,
                                prompt: promptDrafts[item.slot] ?? item.prompt,
                              });
                              setImagePrompts(prompts);
                              setPromptDrafts(Object.fromEntries(prompts.map((p) => [p.slot, p.prompt])));
                              if (draft) applyVersionPayload({ draft });
                              setPromptMessage(`已儲存「${item.title}」，已記入草稿`);
                            } catch (e) {
                              setPromptMessage(e instanceof Error ? e.message : '儲存失敗');
                            } finally {
                              setPromptBusy(null);
                            }
                          }}
                        >
                          {promptBusy === item.slot ? '儲存中…' : '儲存這段'}
                        </Button>
                        <Button
                          variant="ghost"
                          disabled={promptBusy === item.slot}
                          onClick={async () => {
                            if (!slug) return;
                            setPromptBusy(item.slot);
                            setPromptMessage(null);
                            try {
                              const { prompts, draft } = await api.saveBrandImagePrompt(slug, { slot: item.slot, reset: true });
                              setImagePrompts(prompts);
                              setPromptDrafts(Object.fromEntries(prompts.map((p) => [p.slot, p.prompt])));
                              if (draft) applyVersionPayload({ draft });
                              setPromptMessage(`已還原「${item.title}」為系統預設`);
                            } catch (e) {
                              setPromptMessage(e instanceof Error ? e.message : '還原失敗');
                            } finally {
                              setPromptBusy(null);
                            }
                          }}
                        >
                          還原預設
                        </Button>
                      </div>
                    </div>
                  ))}
                  {imagePrompts.length === 0 && (
                    <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>正在載入預設 Prompt，請重新整理此頁。</p>
                  )}
                  {promptMessage && <p style={{ fontSize: 13 }}>{promptMessage}</p>}
                </div>
              )}

              {tab === 'library' && (
                <div style={{ display: 'grid', gap: 24 }}>
                  {slug && (
                    <BrandAssetLibrary
                      slug={slug}
                      assets={assets}
                      canEdit={canEdit}
                      onAssetsChange={setAssets}
                    />
                  )}

                  <div>
                    <Field label="文件">
                      <div />
                    </Field>
                    <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
                      {seedDocuments.map((d) => (
                        <div key={d.id} className="card-row" style={{ ...cardBoxStyle, alignItems: 'center', flexWrap: 'wrap' }}>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 600 }}>{d.title}</div>
                            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{d.fileUrl}</div>
                          </div>
                          <Badge tone="secondary">{d.sourceType}</Badge>
                        </div>
                      ))}
                      {seedDocuments.length === 0 && (
                        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>尚無文件資料。EDM／簡報請到「EDM／簡報」分頁上傳。</p>
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
一句話定位: ${tagline}

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

function ExampleEditor({
  item, hideWeight, busy, canEdit, onChange, onSave, onDelete,
}: {
  item: BrandExample;
  hideWeight?: boolean;
  busy: boolean;
  canEdit: boolean;
  onChange: (next: BrandExample) => void;
  onSave: (item: BrandExample) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
}) {
  const [note, setNote] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  return (
    <div style={{ ...cardBoxStyle, display: 'grid', gap: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: hideWeight ? '1fr' : '1fr 110px', gap: 8 }}>
        <label style={miniLabel}>
          <span>{hideWeight ? '主題名稱' : '這類在講什麼'}</span>
          <input
            value={item.title}
            disabled={!canEdit}
            placeholder={hideWeight ? '例如：換季收納、月底對帳' : '例如：現場痛點、怎麼開始用'}
            onChange={(e) => { setNote(null); onChange({ ...item, title: e.target.value }); }}
            style={inputStyle}
          />
        </label>
        {!hideWeight && (
          <label style={miniLabel}>
            <span>大約佔幾成</span>
            <input
              type="number"
              value={item.weightPercent ?? 0}
              disabled={!canEdit}
              onChange={(e) => { setNote(null); onChange({ ...item, weightPercent: Number(e.target.value) }); }}
              style={inputStyle}
            />
          </label>
        )}
      </div>
      <label style={miniLabel}>
        <span>{hideWeight ? '小編該怎麼寫' : '補充說明'}</span>
        <textarea
          value={item.body ?? ''}
          disabled={!canEdit}
          rows={3}
          placeholder={hideWeight ? '例如：用房東月底對不到帳的畫面開頭，不要先推產品。' : '這類內容要注意什麼'}
          onChange={(e) => { setNote(null); onChange({ ...item, body: e.target.value }); }}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </label>
      {canEdit && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={async () => {
              setFailed(false);
              setNote(null);
              try {
                await onSave(item);
                setNote('已儲存');
              } catch (e) {
                setFailed(true);
                setNote(e instanceof Error ? e.message : '儲存失敗');
              }
            }}
          >
            {busy ? '儲存中…' : '儲存'}
          </Button>
          <Button type="button" variant="danger" disabled={busy} onClick={() => void onDelete(item.id)}>刪除</Button>
          {note && (
            <span style={{ fontSize: 12, color: failed ? 'var(--color-danger)' : 'var(--color-primary-dark)' }}>{note}</span>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>{label}</div>
        {hint && <HelpTip text={hint} label={`${label}說明`} />}
      </div>
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

const miniLabel: CSSProperties = {
  display: 'grid',
  gap: 4,
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--color-text-muted)',
};
