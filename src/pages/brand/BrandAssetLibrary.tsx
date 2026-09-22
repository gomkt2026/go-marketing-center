import { useMemo, useState, type CSSProperties } from 'react';
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
  border: '1px solid var(--color-border)', borderRadius: 10, padding: 14, background: 'var(--color-bg)',
};

const inputStyle: CSSProperties = {
  padding: '7px 12px', borderRadius: 8, border: '1px solid var(--color-border)',
  fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box',
};

type AssetDraft = {
  name: string;
  imageCategory: BrandAssetImageCategory;
  assetRole: BrandAssetRole | '';
  feature: string;
  usageContext: string;
  caption: string;
  assetStatus: BrandAssetStatus;
};

const emptyDraft = (category: BrandAssetImageCategory = 'system_screenshot'): AssetDraft => ({
  name: '',
  imageCategory: category,
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
  const [draft, setDraft] = useState<AssetDraft>(emptyDraft());
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<AssetDraft>(emptyDraft());
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generatingAssetId, setGeneratingAssetId] = useState<string | null>(null);
  const [generatedContentId, setGeneratedContentId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterFeature, setFilterFeature] = useState('');
  const [filterStatus, setFilterStatus] = useState('active');

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

  async function uploadAsset() {
    if (!uploadFile) return;
    setUploading(true);
    setError(null);
    try {
      const { asset } = await api.uploadBrandAsset(slug, {
        file: uploadFile,
        name: draft.name.trim() || undefined,
        caption: draft.caption.trim() || undefined,
        imageCategory: draft.imageCategory,
        assetRole: draft.assetRole || undefined,
        feature: draft.feature || undefined,
        usageContext: draft.usageContext.trim() || undefined,
        assetStatus: draft.assetStatus,
      });
      onAssetsChange((prev) => [normalizeAsset(asset), ...prev]);
      setUploadFile(null);
      setDraft(emptyDraft(draft.imageCategory));
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
        imageCategory: editDraft.imageCategory,
        assetRole: editDraft.assetRole || null,
        feature: editDraft.feature || null,
        usageContext: editDraft.usageContext.trim() || null,
        assetStatus: editDraft.assetStatus,
      });
      onAssetsChange((prev) => prev.map((a) => (a.id === id ? normalizeAsset(asset, a) : a)));
      setEditingId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '儲存失敗');
    } finally {
      setSavingId(null);
    }
  }

  async function deleteAsset(id: string) {
    await api.deleteBrandAsset(slug, id);
    onAssetsChange((prev) => prev.filter((a) => a.id !== id));
    if (editingId === id) setEditingId(null);
  }

  async function generateFromAsset(id: string, platform: 'facebook' | 'instagram' | 'threads') {
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
    setEditingId(asset.id);
    setEditDraft({
      name: asset.name ?? '',
      imageCategory: asset.imageCategory ?? 'system_screenshot',
      assetRole: asset.assetRole ?? '',
      feature: asset.feature ?? '',
      usageContext: asset.usageContext ?? '',
      caption: asset.caption ?? '',
      assetStatus: asset.assetStatus ?? 'active',
    });
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
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="file" accept="image/*"
                onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                style={{ fontSize: 12 }}
              />
              <input
                type="text" placeholder={copy.name}
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                style={{ ...inputStyle, flex: 1, minWidth: 200 }}
              />
              <select
                value={draft.imageCategory}
                onChange={(e) => setDraft((d) => ({ ...d, imageCategory: e.target.value as BrandAssetImageCategory }))}
                style={inputStyle}
              >
                {taxonomy.categories.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <Button variant="secondary" disabled={!uploadFile || uploading} onClick={() => void uploadAsset()}>
                {uploading ? '上傳中…' : '+ 上傳圖片'}
              </Button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
              <select
                value={draft.assetRole}
                onChange={(e) => setDraft((d) => ({ ...d, assetRole: e.target.value as BrandAssetRole | '' }))}
                style={inputStyle}
              >
                <option value="">角色（可不選）</option>
                {taxonomy.roles.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <select
                value={draft.feature}
                onChange={(e) => setDraft((d) => ({ ...d, feature: e.target.value }))}
                style={inputStyle}
              >
                <option value="">功能（可不選）</option>
                {taxonomy.features.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
              <input
                type="text" placeholder={copy.usage}
                value={draft.usageContext}
                onChange={(e) => setDraft((d) => ({ ...d, usageContext: e.target.value }))}
                style={inputStyle}
              />
              <select
                value={draft.assetStatus}
                onChange={(e) => setDraft((d) => ({ ...d, assetStatus: e.target.value as BrandAssetStatus }))}
                style={inputStyle}
              >
                {taxonomy.statuses.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <textarea
              placeholder={copy.caption}
              value={draft.caption}
              onChange={(e) => setDraft((d) => ({ ...d, caption: e.target.value }))}
              rows={2}
              style={{ ...inputStyle, width: '100%', resize: 'vertical' }}
            />
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
            style={{ ...inputStyle, flex: 1, minWidth: 180 }}
          />
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} style={inputStyle}>
            <option value="">全部類型</option>
            {taxonomy.categories.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)} style={inputStyle}>
            <option value="">全部角色</option>
            {taxonomy.roles.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select value={filterFeature} onChange={(e) => setFilterFeature(e.target.value)} style={inputStyle}>
            <option value="">全部功能</option>
            {taxonomy.features.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={inputStyle}>
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

      <div className="grid-auto">
        {visible.map((a) => {
          const status = a.assetStatus || 'active';
          return (
            <div key={a.id} style={cardBoxStyle}>
              {a.fileUrl && (
                <img
                  src={a.fileUrl} alt={a.name || a.caption || '素材'}
                  style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: 8, marginBottom: 8 }}
                />
              )}
              <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 6, wordBreak: 'break-word' }}>
                {a.name || '未命名素材'}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {a.imageCategory && <Badge tone="secondary">{imageCategoryLabel[a.imageCategory] ?? a.imageCategory}</Badge>}
                {a.assetRole && <Badge tone="default">{roleLabel(slug, a.assetRole) ?? a.assetRole}</Badge>}
                {a.feature && <Badge tone="default">{a.feature}</Badge>}
                <Badge tone={assetStatusTone(status)}>{assetStatusLabel[status] ?? '現行'}</Badge>
                <Badge tone="default">已用 {a.usedInThreadsCount ?? 0} 次</Badge>
              </div>

              {editingId === a.id && (
                <div style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
                  <input value={editDraft.name} onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))} style={inputStyle} placeholder="素材名稱" />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <select value={editDraft.imageCategory} onChange={(e) => setEditDraft((d) => ({ ...d, imageCategory: e.target.value as BrandAssetImageCategory }))} style={inputStyle}>
                      {taxonomy.categories.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <select value={editDraft.assetStatus} onChange={(e) => setEditDraft((d) => ({ ...d, assetStatus: e.target.value as BrandAssetStatus }))} style={inputStyle}>
                      {taxonomy.statuses.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <select value={editDraft.assetRole} onChange={(e) => setEditDraft((d) => ({ ...d, assetRole: e.target.value as BrandAssetRole | '' }))} style={inputStyle}>
                      <option value="">角色（可不選）</option>
                      {taxonomy.roles.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <select value={editDraft.feature} onChange={(e) => setEditDraft((d) => ({ ...d, feature: e.target.value }))} style={inputStyle}>
                      <option value="">功能（可不選）</option>
                      {taxonomy.features.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                  <input value={editDraft.usageContext} onChange={(e) => setEditDraft((d) => ({ ...d, usageContext: e.target.value }))} style={inputStyle} placeholder="畫面用途" />
                  <textarea value={editDraft.caption} onChange={(e) => setEditDraft((d) => ({ ...d, caption: e.target.value }))} rows={2} style={{ ...inputStyle, resize: 'vertical' }} placeholder="素材說明" />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Button variant="secondary" disabled={!!savingId} onClick={() => void saveEdit(a.id)}>
                      {savingId === a.id ? '儲存中…' : '儲存'}
                    </Button>
                    <Button variant="ghost" onClick={() => setEditingId(null)}>取消</Button>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(['facebook', 'instagram', 'threads'] as const).map((p) => {
                  const busy = generatingAssetId === `${a.id}:${p}`;
                  const label = p === 'facebook' ? 'FB' : p === 'instagram' ? 'IG' : 'Threads';
                  return (
                    <Button
                      key={p}
                      variant={p === 'threads' ? 'primary' : 'secondary'}
                      style={{ padding: '4px 10px', fontSize: 12 }}
                      disabled={!!generatingAssetId}
                      onClick={() => void generateFromAsset(a.id, p)}
                    >
                      {busy ? '生成中…' : `用這張圖生成 ${label}`}
                    </Button>
                  );
                })}
                {canEdit && editingId !== a.id && (
                  <Button variant="ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => startEdit(a)}>
                    編輯
                  </Button>
                )}
                {canEdit && (
                  <Button variant="danger" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => void deleteAsset(a.id)}>
                    刪除
                  </Button>
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
    </div>
  );
}

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
