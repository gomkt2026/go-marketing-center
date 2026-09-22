import type { CSSProperties } from 'react';
import { Badge } from '@/components/ui/Badge';
import type { BrandKnowledgeChange, BrandVersion } from '@/types';

const SECTION_LABEL: Record<string, string> = {
  core: '品牌核心',
  audience: '受眾',
  persona: 'Persona',
  channel: '平台調性',
  rule: '規則邊界',
  visual: '視覺',
  keyword: '關鍵字',
  example: '內容支柱／主題',
  image_prompt: '產圖 Prompt',
};

const ACTION_LABEL: Record<string, string> = {
  update: '調整',
  create: '新增',
  delete: '刪除',
};

function clip(value: unknown, max = 90): string {
  if (value == null) return '（空）';
  if (typeof value === 'string') {
    const s = value.replace(/\s+/g, ' ').trim();
    if (!s) return '（空）';
    return s.length > max ? `${s.slice(0, max)}…` : s;
  }
  if (Array.isArray(value)) return value.map((v) => String(v)).join('、') || '（空）';
  if (typeof value === 'object') {
    const rec = value as Record<string, unknown>;
    const preferred = rec.statement ?? rec.name ?? rec.title ?? rec.value ?? rec.tagline ?? rec.prompt ?? rec.label;
    if (preferred != null) return clip(preferred, max);
    try {
      const s = JSON.stringify(value);
      return s.length > max ? `${s.slice(0, max)}…` : s;
    } catch {
      return '（已改）';
    }
  }
  return String(value);
}

export function formatChangeLine(change: BrandKnowledgeChange): string {
  const sec = SECTION_LABEL[change.section] ?? change.section;
  const act = ACTION_LABEL[change.action] ?? change.action;
  if (change.action === 'update') {
    return `${act}${sec}「${change.label}」：${clip(change.before)} → ${clip(change.after)}`;
  }
  return `${act}${sec}「${change.label}」`;
}

export function versionStatusLabel(status: BrandVersion['status']): string {
  if (status === 'draft') return '草稿';
  if (status === 'archived') return '已封存';
  return '已發布';
}

export function VersionHistoryList({ versions }: { versions: BrandVersion[] }) {
  if (!versions.length) {
    return <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>還沒有版本紀錄。改完品牌智慧後按「發布這個版本」就會留下一筆。</p>;
  }
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {versions.map((v) => (
        <div key={v.id} style={historyCardStyle}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <strong>v{v.versionNumber}</strong>
            <Badge tone={v.status === 'published' ? 'primary' : v.status === 'draft' ? 'accent' : 'default'}>
              {versionStatusLabel(v.status)}
            </Badge>
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
              {v.publishedAt
                ? new Date(v.publishedAt).toLocaleString('zh-TW')
                : v.updatedAt
                  ? new Date(v.updatedAt).toLocaleString('zh-TW')
                  : ''}
            </span>
          </div>
          {v.summaryOfChanges && (
            <pre style={summaryStyle}>{v.summaryOfChanges}</pre>
          )}
          {(v.changeLog ?? []).length > 0 && (
            <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13, lineHeight: 1.65 }}>
              {(v.changeLog ?? []).map((c) => (
                <li key={c.id}>
                  {formatChangeLine(c)}
                  {c.by ? <span style={{ color: 'var(--color-text-muted)' }}> · {c.by}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

const historyCardStyle: CSSProperties = {
  border: '1px solid var(--color-border)',
  borderRadius: 10,
  padding: 14,
  background: 'var(--color-bg)',
};

const summaryStyle: CSSProperties = {
  margin: '8px 0 0',
  whiteSpace: 'pre-wrap',
  fontFamily: 'inherit',
  fontSize: 13,
  lineHeight: 1.6,
  color: 'var(--color-text-muted)',
};
