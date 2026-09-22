import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { HelpTip } from '@/components/ui/HelpTip';
import { api } from '@/lib/api';
import {
  assetStatusLabel, assetStatusTone, fallbackTaxonomy, imageCategoryLabel, libraryCopy, roleLabel,
} from '@/lib/brand-asset-library';
import type {
  BrandAsset, BrandAssetImageCategory, BrandAssetRole, BrandAssetStatus, BrandAssetTaxonomy,
} from '@/types';

const cardBoxStyle: CSSProperties = {
  border: '1px solid var(--color-border)',
  borderRadius: 10,
  padding: 14,
  background: 'var(--color-bg)',
  minWidth: 0,
  overflow: 'visible',
};

const inputStyle: CSSProperties = {
  padding: '7px 12px', borderRadius: 8, border: '1px solid var(--color-border)',
  fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box', width: '100%',
};

const labelStyle: CSSProperties = {
  display: 'grid', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--color-text)',
};

const menuPanelStyle: CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 6px)',
  minWidth: 168,
  background: 'var(--color-bg)',
  border: '1px solid var(--color-border)',
  borderRadius: 10,
  boxShadow: 'var(--shadow-card-hover)',
  padding: 6,
  zIndex: 12,
};

type AssetDraft = {
  name: string;
  imageCategory: BrandAssetImageCategory | '';
  assetRole: BrandAssetRole | '';
  feature: string;
  usageContext: string;
  caption: string;
  assetStatus: BrandAssetStatus;
};

const emptyDraft = (): AssetDraft => ({
  name: '',
  imageCategory: '',
  assetRole: '',
  feature: '',
  usageContext: '',
  caption: '',
  assetStatus: 'active',
});

function matchesAsset(asset: BrandAsset, q: string): boolean {
  const hay = [asset.name, asset.caption, asset.feature, asset.usageContext]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

function isLikelyFilename(value: string): boolean {
  return /\.(jpe?g|png|webp|gif)$/i.test(value.trim());
}

function fileNameFromUrl(fileUrl: string | null | undefined): string {
  if (!fileUrl) return '';
  try {
    return decodeURIComponent(fileUrl.split('/').pop() ?? '');
  } catch {
    return fileUrl.split('/').pop() ?? '';
  }
}

/** Card / drawer 主標題：有可讀名稱就用名稱，否則才退回原始檔名。 */
function displayAssetName(asset: BrandAsset): string {
  const name = asset.name?.trim() ?? '';
  if (name && !isLikelyFilename(name)) return name;
  return name || fileNameFromUrl(asset.fileUrl) || '未命名素材';
}

function originalFilename(asset: BrandAsset): string {
  const name = asset.name?.trim() ?? '';
  if (isLikelyFilename(name)) return name;
  return fileNameFromUrl(asset.fileUrl) || '—';
}

function formatTs(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('zh-TW');
}

function draftsEqual(a: AssetDraft, b: AssetDraft): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={labelStyle}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function BrandAssetLibrary({
  slug,
  assets,
  canEdit,
  onAssetsChange,
}: {
  slug: string;
  assets: BrandAsset[];
  canEdit: boolean;
  onAssetsChange: (next: BrandAsset[] | ((prev: BrandAsset[]) => BrandAsset[])) => void;
}) {
  const taxonomy: BrandAssetTaxonomy = fallbackTaxonomy(slug);
  const copy = libraryCopy(slug);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [draft, setDraft] = useState<AssetDraft>(emptyDraft());
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<AssetDraft>(emptyDraft());
  const [editSnapshot, setEditSnapshot] = useState<AssetDraft>(emptyDraft());
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generatingAssetId, setGeneratingAssetId] = useState<string | null>(null);
  const [generatedContentId, setGeneratedContentId] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<{ id: string; kind: 'use' | 'more' } | null>(null);
  const [q, setQ] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterFeature, setFilterFeature] = useState('');
  const [filterStatus, setFilterStatus] = useState('active');

  const editDirty = !draftsEqual(editDraft, editSnapshot);
  const editingAsset = assets.find((a) => a.id === editingId) ?? null;

  const visible = useMemo(() => {
    const query = q.trim().toLowerCase();
    return assets.filter((a) => {
      const status = a.assetStatus || 'active';
      if (filterStatus && filterStatus !== 'all' && status !== filterStatus) return false;
      if (filterCategory && a.imageCategory !== filterCategory) return false;
      if (filterRole && a.assetRole !== filterRole) return false;
      if (filterFeature && a.feature !== filterFeature) return false;
      if (query && !matchesAsset(a, query)) return false;
      return true;
    });
  }, [assets, q, filterCategory, filterRole, filterFeature, filterStatus]);

  useEffect(() => {
    if (!openMenu) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as HTMLElement | null;
      if (t?.closest('[data-asset-menu]')) return;
      setOpenMenu(null);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [openMenu]);

  useEffect(() => {
    if (!editingId) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [editingId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (openMenu) {
        setOpenMenu(null);
        return;
      }
      if (editingId && !editDirty) closeDrawer();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openMenu, editingId, editDirty]);

  function closeDrawer() {
    setEditingId(null);
    setEditDraft(emptyDraft());
    setEditSnapshot(emptyDraft());
  }

  async function uploadAsset() {
    if (!uploadFile) return;
    setUploading(true);
    setError(null);
    try {
      const { asset } = await api.uploadBrandAsset(slug, {
        file: uploadFile,
        name: draft.name.trim() || undefined,
        caption: draft.caption.trim() || undefined,
        imageCategory: draft.imageCategory || undefined,
        assetRole: draft.assetRole || undefined,
        feature: draft.feature || undefined,
        usageContext: draft.usageContext.trim() || undefined,
        assetStatus: draft.assetStatus,
      });
      onAssetsChange((prev) => [normalizeAsset(asset), ...prev]);
      setUploadFile(null);
      setFileInputKey((n) => n + 1);
      setDraft(emptyDraft());
    } catch (e) {
      setError(e instanceof Error ? e.message : '上傳失敗');
    } finally {
      setUploading(false);
    }
  }

  async function saveEdit(id: string) {
    setSavingId(id);
    setError(null);
    try {
      const { asset } = await api.updateBrandAsset(slug, id, {
        name: editDraft.name.trim(),
        caption: editDraft.caption.trim() || null,
        imageCategory: editDraft.imageCategory || null,
        assetRole: editDraft.assetRole || null,
        feature: editDraft.feature || null,
        usageContext: editDraft.usageContext.trim() || null,
        assetStatus: editDraft.assetStatus,
      });
      onAssetsChange((prev) => prev.map((a) => (a.id === id ? normalizeAsset(asset, a) : a)));
      closeDrawer();
    } catch (e) {
      setError(e instanceof Error ? e.message : '儲存失敗');
    } finally {
      setSavingId(null);
    }
  }

  async function deleteAsset(asset: BrandAsset) {
    const label = displayAssetName(asset);
    if (!window.confirm(`確定刪除「${label}」？此操作無法復原。`)) return;
    await api.deleteBrandAsset(slug, asset.id);
    onAssetsChange((prev) => prev.filter((a) => a.id !== asset.id));
    if (editingId === asset.id) closeDrawer();
    setOpenMenu(null);
  }

  async function generateFromAsset(id: string, platform: 'facebook' | 'instagram' | 'threads') {
    setOpenMenu(null);
    setGeneratingAssetId(`${id}:${platform}`);
    setError(null);
    setGeneratedContentId(null);
    try {
      const { contentId } = await api.generatePostFromAsset(slug, id, platform);
      setGeneratedContentId(contentId);
      onAssetsChange((prev) => prev.map((a) => (a.id === id
        ? { ...a, usedInThreadsCount: (a.usedInThreadsCount ?? 0) + 1, lastUsedAt: new Date().toISOString() }
        : a)));
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成失敗');
    } finally {
      setGeneratingAssetId(null);
    }
  }

  function startEdit(asset: BrandAsset) {
    const next: AssetDraft = {
      name: asset.name ?? '',
      imageCategory: asset.imageCategory ?? '',
      assetRole: asset.assetRole ?? '',
      feature: asset.feature ?? '',
      usageContext: asset.usageContext ?? '',
      caption: asset.caption ?? '',
      assetStatus: asset.assetStatus ?? 'active',
    };
    setOpenMenu(null);
    setEditingId(asset.id);
    setEditDraft(next);
    setEditSnapshot(next);
  }

  function requestCloseDrawer() {
    if (editDirty) return;
    closeDrawer();
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>圖片素材庫</div>
        <HelpTip
          text="這裡放真實品牌素材。系統畫面請標角色與功能，AI 產圖會優先用「現行」素材，不會自己畫假的產品 UI 或 Logo。"
          label="素材庫說明"
        />
      </div>

      {canEdit && (
        <div style={{ ...cardBoxStyle, marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>新增素材</div>
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
              <Field label="選擇檔案">
                <input
                  key={fileInputKey}
                  type="file"
                  accept="image/*"
                  onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                  style={{ fontSize: 12 }}
                />
              </Field>
              <Field label="素材名稱">
                <input
                  type="text"
                  placeholder={copy.name}
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  style={inputStyle}
                />
              </Field>
              <Field label="素材類型">
                <select
                  value={draft.imageCategory}
                  onChange={(e) => setDraft((d) => ({ ...d, imageCategory: e.target.value as BrandAssetImageCategory | '' }))}
                  style={inputStyle}
                >
                  <option value="">請選擇素材類型</option>
                  {taxonomy.categories.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
              <Field label="狀態">
                <select
                  value={draft.assetStatus}
                  onChange={(e) => setDraft((d) => ({ ...d, assetStatus: e.target.value as BrandAssetStatus }))}
                  style={inputStyle}
                >
                  {taxonomy.statuses.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
              <Field label="角色">
                <select
                  value={draft.assetRole}
                  onChange={(e) => setDraft((d) => ({ ...d, assetRole: e.target.value as BrandAssetRole | '' }))}
                  style={inputStyle}
                >
                  <option value="">角色（可不選）</option>
                  {taxonomy.roles.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
              <Field label="功能">
                <select
                  value={draft.feature}
                  onChange={(e) => setDraft((d) => ({ ...d, feature: e.target.value }))}
                  style={inputStyle}
                >
                  <option value="">功能（可不選）</option>
                  {taxonomy.features.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </Field>
              <Field label="畫面用途">
                <input
                  type="text"
                  placeholder={copy.usage}
                  value={draft.usageContext}
                  onChange={(e) => setDraft((d) => ({ ...d, usageContext: e.target.value }))}
                  style={inputStyle}
                />
              </Field>
            </div>
            <Field label="素材說明">
              <textarea
                placeholder={copy.caption}
                value={draft.caption}
                onChange={(e) => setDraft((d) => ({ ...d, caption: e.target.value }))}
                rows={2}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </Field>
            <div>
              <Button variant="secondary" disabled={!uploadFile || uploading} onClick={() => void uploadAsset()}>
                {uploading ? '上傳中…' : '+ 上傳圖片'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div style={{ ...cardBoxStyle, marginBottom: 12, display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            type="search"
            placeholder="搜尋名稱或說明"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ ...inputStyle, flex: 1, minWidth: 180, width: 'auto' }}
          />
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
            <option value="">全部類型</option>
            {taxonomy.categories.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
            <option value="">全部角色</option>
            {taxonomy.roles.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select value={filterFeature} onChange={(e) => setFilterFeature(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
            <option value="">全部功能</option>
            {taxonomy.features.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
            <option value="all">全部狀態</option>
            {taxonomy.statuses.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
          顯示 {visible.length} / {assets.length} 張。預設只看現行，舊版與停用仍保留，但 AI 產圖不會預設選它們。
        </div>
      </div>

      {error && <p style={{ fontSize: 12, color: 'var(--color-danger)', marginBottom: 8 }}>{error}</p>}
      {generatedContentId && (
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 8 }}>
          已生成貼文草稿，請至內容審閱頁查看（content id: {generatedContentId}）。
        </p>
      )}

      <div className="asset-library-grid">
        {visible.map((a) => {
          const status = a.assetStatus || 'active';
          const metaBits = [
            a.imageCategory ? (imageCategoryLabel[a.imageCategory] ?? a.imageCategory) : null,
            a.assetRole ? (roleLabel(slug, a.assetRole) ?? a.assetRole) : null,
            a.feature || null,
          ].filter(Boolean);
          const useOpen = openMenu?.id === a.id && openMenu.kind === 'use';
          const moreOpen = openMenu?.id === a.id && openMenu.kind === 'more';
          const generatingThis = generatingAssetId?.startsWith(`${a.id}:`);
          return (
            <div key={a.id} style={{ ...cardBoxStyle, position: 'relative', zIndex: (useOpen || moreOpen) ? 9 : 0 }}>
              {a.fileUrl && (
                <img
                  src={a.fileUrl}
                  alt={displayAssetName(a)}
                  style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: 8, marginBottom: 8 }}
                />
              )}
              <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 4, wordBreak: 'break-word' }}>
                {displayAssetName(a)}
              </div>
              {metaBits.length > 0 && (
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 8, lineHeight: 1.45 }}>
                  {metaBits.join(' · ')}
                </div>
              )}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
                <Badge tone={assetStatusTone(status)}>{assetStatusLabel[status] ?? '現行'}</Badge>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>已用 {a.usedInThreadsCount ?? 0} 次</span>
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <div data-asset-menu style={{ position: 'relative' }}>
                  <Button
                    variant="secondary"
                    style={{ padding: '4px 10px', fontSize: 12 }}
                    disabled={!!generatingAssetId}
                    onClick={() => setOpenMenu(useOpen ? null : { id: a.id, kind: 'use' })}
                  >
                    {generatingThis ? '生成中…' : '使用素材 ▾'}
                  </Button>
                  {useOpen && (
                    <div style={{ ...menuPanelStyle, left: 0 }}>
                      {([
                        ['facebook', '生成 Facebook'],
                        ['instagram', '生成 Instagram'],
                        ['threads', '生成 Threads'],
                      ] as const).map(([platform, label]) => (
                        <button
                          key={platform}
                          type="button"
                          disabled={!!generatingAssetId}
                          onClick={() => void generateFromAsset(a.id, platform)}
                          style={menuItemStyle}
                        >
                          {generatingAssetId === `${a.id}:${platform}` ? '生成中…' : label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {canEdit && (
                  <Button variant="ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => startEdit(a)}>
                    編輯
                  </Button>
                )}
                {canEdit && (
                  <div data-asset-menu style={{ position: 'relative', marginLeft: 'auto' }}>
                    <Button
                      variant="ghost"
                      style={{ padding: '4px 10px', fontSize: 12, minWidth: 36 }}
                      onClick={() => setOpenMenu(moreOpen ? null : { id: a.id, kind: 'more' })}
                    >
                      ⋯
                    </Button>
                    {moreOpen && (
                      <div style={{ ...menuPanelStyle, right: 0 }}>
                        <button
                          type="button"
                          onClick={() => void deleteAsset(a)}
                          style={{ ...menuItemStyle, color: '#B85454' }}
                        >
                          刪除素材
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {visible.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            {assets.length === 0 ? '尚未上傳任何圖片素材' : '沒有符合篩選的素材，可改看「全部狀態」。'}
          </p>
        )}
      </div>

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {editingAsset && (
            <div
              key={editingAsset.id}
              className="asset-edit-overlay"
              onClick={requestCloseDrawer}
            >
              <motion.aside
                className="asset-edit-drawer"
                role="dialog"
                aria-modal="true"
                aria-labelledby="asset-edit-title"
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '16px 18px', borderBottom: '1px solid var(--color-border)' }}>
                  <h3 id="asset-edit-title" style={{ fontSize: 16 }}>編輯素材</h3>
                  <button
                    type="button"
                    onClick={requestCloseDrawer}
                    aria-label="關閉"
                    style={{
                      border: 'none', background: 'transparent', cursor: editDirty ? 'not-allowed' : 'pointer',
                      fontSize: 20, lineHeight: 1, color: 'var(--color-text-muted)', padding: 4,
                    }}
                  >
                    ×
                  </button>
                </div>
                <div style={{ flex: 1, overflow: 'auto', padding: 18, display: 'grid', gap: 12 }}>
                  {editingAsset.fileUrl && (
                    <img
                      src={editingAsset.fileUrl}
                      alt={displayAssetName(editingAsset)}
                      style={{ width: '100%', height: 180, objectFit: 'cover', borderRadius: 10 }}
                    />
                  )}
                  <Field label="素材名稱">
                    <input
                      value={editDraft.name}
                      onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                      style={inputStyle}
                      placeholder={copy.name}
                    />
                  </Field>
                  <Field label="素材類型">
                    <select
                      value={editDraft.imageCategory}
                      onChange={(e) => setEditDraft((d) => ({ ...d, imageCategory: e.target.value as BrandAssetImageCategory | '' }))}
                      style={inputStyle}
                    >
                      <option value="">請選擇素材類型</option>
                      {taxonomy.categories.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </Field>
                  <Field label="狀態">
                    <select
                      value={editDraft.assetStatus}
                      onChange={(e) => setEditDraft((d) => ({ ...d, assetStatus: e.target.value as BrandAssetStatus }))}
                      style={inputStyle}
                    >
                      {taxonomy.statuses.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </Field>
                  <Field label="角色">
                    <select
                      value={editDraft.assetRole}
                      onChange={(e) => setEditDraft((d) => ({ ...d, assetRole: e.target.value as BrandAssetRole | '' }))}
                      style={inputStyle}
                    >
                      <option value="">角色（可不選）</option>
                      {taxonomy.roles.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </Field>
                  <Field label="功能">
                    <select
                      value={editDraft.feature}
                      onChange={(e) => setEditDraft((d) => ({ ...d, feature: e.target.value }))}
                      style={inputStyle}
                    >
                      <option value="">功能（可不選）</option>
                      {taxonomy.features.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </Field>
                  <Field label="畫面用途">
                    <input
                      value={editDraft.usageContext}
                      onChange={(e) => setEditDraft((d) => ({ ...d, usageContext: e.target.value }))}
                      style={inputStyle}
                      placeholder={copy.usage}
                    />
                  </Field>
                  <Field label="素材說明">
                    <textarea
                      value={editDraft.caption}
                      onChange={(e) => setEditDraft((d) => ({ ...d, caption: e.target.value }))}
                      rows={4}
                      style={{ ...inputStyle, resize: 'vertical' }}
                      placeholder={copy.caption}
                    />
                  </Field>
                  <div style={{ display: 'grid', gap: 6, fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.55, paddingTop: 4 }}>
                    <div>原始檔名：{originalFilename(editingAsset)}</div>
                    <div>建立時間：{formatTs(editingAsset.createdAt)}</div>
                    <div>使用次數：{editingAsset.usedInThreadsCount ?? 0} 次</div>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '14px 18px', borderTop: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
                  <Button variant="ghost" onClick={closeDrawer}>取消</Button>
                  <Button variant="primary" disabled={!!savingId} onClick={() => void saveEdit(editingAsset.id)}>
                    {savingId === editingAsset.id ? '儲存中…' : '儲存變更'}
                  </Button>
                </div>
              </motion.aside>
            </div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}

const menuItemStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  background: 'transparent',
  border: 'none',
  borderRadius: 8,
  padding: '8px 10px',
  fontSize: 13,
  fontFamily: 'inherit',
  cursor: 'pointer',
  color: 'var(--color-text)',
};

function normalizeAsset(asset: BrandAsset, fallback?: BrandAsset): BrandAsset {
  return {
    ...fallback,
    ...asset,
    assetRole: asset.assetRole ?? fallback?.assetRole ?? null,
    feature: asset.feature ?? fallback?.feature ?? null,
    usageContext: asset.usageContext ?? fallback?.usageContext ?? null,
    assetStatus: asset.assetStatus ?? fallback?.assetStatus ?? 'active',
    usedInThreadsCount: asset.usedInThreadsCount ?? fallback?.usedInThreadsCount ?? 0,
  };
}
