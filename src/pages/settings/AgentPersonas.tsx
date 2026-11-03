import { useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';
import { useAsyncData, LoadingState, ErrorState } from '@/hooks/useAsyncData';
import type { AgentWithPersona } from '@/types';
import { EditorIntroButton, useEditorIntro } from '@/components/editor/EditorIntroButton';

interface PersonaForm {
  nickname: string;
  characterTitle: string;
  temperament: string;
  catchphrase: string;
  focus: string;
}

export function AgentPersonas() {
  const { data, loading, error, reload } = useAsyncData(() => api.agents(), []);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<PersonaForm>({ nickname: '', characterTitle: '', temperament: '', catchphrase: '', focus: '' });
  const [busy, setBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? '載入失敗'} onRetry={reload} />;

  const editors = data.agents.filter((a) => a.roleCode === 'brand_ai' && a.brandId);

  function startEdit(agent: AgentWithPersona) {
    setForm({
      nickname: agent.persona.nickname ?? '',
      characterTitle: agent.persona.characterTitle ?? '',
      temperament: agent.persona.temperament ?? '',
      catchphrase: agent.persona.catchphrase ?? '',
      focus: agent.persona.focus ?? '',
    });
    setEditing(agent.id);
    setMessage(null);
  }

  async function save(agentId: string) {
    setBusy(true);
    setMessage(null);
    try {
      await api.updateAgentPersona(agentId, form);
      setEditing(null);
      setMessage('人設已更新');
      reload();
    } catch (e) {
      setMessage(`儲存失敗:${e instanceof Error ? e.message : '未知錯誤'}`);
    } finally {
      setBusy(false);
    }
  }

  async function regenAvatar(agentId: string) {
    setAvatarBusy(agentId);
    setMessage('🎨 AI 正在畫頭像(約 20-30 秒)…');
    try {
      await api.generateAgentAvatar(agentId);
      setMessage('頭像已更新');
      reload();
    } catch (e) {
      setMessage(`頭像生成失敗:${e instanceof Error ? e.message : '未知錯誤'}`);
    } finally {
      setAvatarBusy(null);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', borderRadius: 8, fontSize: 13,
    border: '1px solid var(--color-border)', background: 'var(--color-bg)',
  };

  return (
    <div>
      <PageHeader
        title="品牌小編人設"
        subtitle="每位小編有自己的性格、口頭禪和聲音。點播放，聽他用自己的聲音自我介紹。"
      />

      {message && (
        <Card style={{ marginBottom: 12, borderLeft: '4px solid var(--color-primary)' }}>
          <p style={{ fontSize: 13 }}>{message}</p>
        </Card>
      )}

      <div className="grid-auto" style={{ gap: 14, alignItems: 'start' }}>
        {editors.map((agent) => (
          <PersonaCard
            key={agent.id}
            agent={agent}
            isEditing={editing === agent.id}
            busy={busy}
            avatarBusy={avatarBusy === agent.id}
            form={form}
            inputStyle={inputStyle}
            onForm={setForm}
            onEdit={() => startEdit(agent)}
            onCancel={() => setEditing(null)}
            onSave={() => void save(agent.id)}
            onAvatar={() => void regenAvatar(agent.id)}
          />
        ))}
      </div>
    </div>
  );
}

function PersonaCard({
  agent, isEditing, busy, avatarBusy, form, inputStyle, onForm, onEdit, onCancel, onSave, onAvatar,
}: {
  agent: AgentWithPersona;
  isEditing: boolean;
  busy: boolean;
  avatarBusy: boolean;
  form: PersonaForm;
  inputStyle: React.CSSProperties;
  onForm: (form: PersonaForm) => void;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onAvatar: () => void;
}) {
  const p = agent.persona;
  const intro = useEditorIntro(agent.brandSlug);
  return (
    <Card>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: intro?.playing ? 8 : 12 }}>
        {p.avatarUrl ? (
          <img
            src={p.avatarUrl}
            alt={p.nickname ?? agent.displayName}
            style={{
              width: 72, height: 72, borderRadius: '50%', objectFit: 'cover',
              border: '2px solid var(--color-border)',
              boxShadow: intro?.playing ? '0 0 0 4px #5B949A55' : undefined,
              transform: intro?.playing ? 'scale(1.04)' : undefined,
            }}
          />
        ) : (
          <div style={{
            width: 72, height: 72, borderRadius: '50%', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 28, background: 'var(--color-bg-soft)', border: '2px dashed var(--color-border)',
          }}>
            {p.characterTitle === '工班師傅' ? '👷' : p.characterTitle === '包租管家' ? '🏠' : p.characterTitle === '賞屋規劃' ? '🏡' : '🧺'}
          </div>
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 16 }}>{p.nickname ?? agent.displayName}</strong>
            <Badge tone="secondary">{agent.brandName}</Badge>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: 2 }}>{p.characterTitle}</div>
          {intro?.playing && <div style={{ marginTop: 6, fontWeight: 800, fontSize: 16 }}>{intro.line}</div>}
        </div>
        <EditorIntroButton slug={agent.brandSlug} hearLabel="聽他自我介紹" stopLabel="暫停" />
      </div>

              {!isEditing ? (
                <div style={{ display: 'grid', gap: 8, fontSize: 13 }}>
                  {p.catchphrase && <div>💬 口頭禪:「{p.catchphrase}」</div>}
                  {p.temperament && <div style={{ lineHeight: 1.7 }}>🎭 性格:{p.temperament}</div>}
                  {p.focus && <div style={{ lineHeight: 1.7, color: 'var(--color-text-muted)' }}>🎯 關注:{p.focus}</div>}
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                    <Button variant="secondary" disabled={avatarBusy} onClick={onAvatar}>
                      {avatarBusy ? '生成中...' : p.avatarUrl ? '重新生成頭像' : '生成頭像'}
                    </Button>
                    <Button variant="ghost" onClick={onEdit}>編輯人設</Button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  <label style={{ fontSize: 12.5 }}>
                    暱稱
                    <input style={inputStyle} value={form.nickname} onChange={(e) => onForm({ ...form, nickname: e.target.value })} />
                  </label>
                  <label style={{ fontSize: 12.5 }}>
                    角色(影響頭像造型)
                    <input style={inputStyle} value={form.characterTitle} onChange={(e) => onForm({ ...form, characterTitle: e.target.value })} />
                  </label>
                  <label style={{ fontSize: 12.5 }}>
                    性格描述(可情緒化程度、講話風格)
                    <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} value={form.temperament} onChange={(e) => onForm({ ...form, temperament: e.target.value })} />
                  </label>
                  <label style={{ fontSize: 12.5 }}>
                    口頭禪
                    <input style={inputStyle} value={form.catchphrase} onChange={(e) => onForm({ ...form, catchphrase: e.target.value })} />
                  </label>
                  <label style={{ fontSize: 12.5 }}>
                    立場關注點
                    <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={form.focus} onChange={(e) => onForm({ ...form, focus: e.target.value })} />
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button variant="primary" disabled={busy} onClick={onSave}>{busy ? '儲存中...' : '儲存'}</Button>
                    <Button variant="ghost" onClick={onCancel}>取消</Button>
                  </div>
                </div>
              )}
    </Card>
  );
}
