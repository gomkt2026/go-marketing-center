import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useBrand } from '@/context/BrandContext';
import { api } from '@/lib/api';
import { useAsyncData, LoadingState, ErrorState } from '@/hooks/useAsyncData';
import type { MeetingStatus } from '@/types';
import { MeetingDetail } from './MeetingDetail';

const statusTone: Record<MeetingStatus, BadgeTone> = {
  scheduled: 'default', in_progress: 'accent', concluded: 'primary', archived: 'default',
};
const statusLabel: Record<MeetingStatus, string> = {
  scheduled: '已排程', in_progress: '進行中', concluded: '已結束', archived: '已封存',
};

export function MeetingList() {
  const { meetingId } = useParams();
  const { brandById, currentBrand } = useBrand();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const { data, loading, error, reload } = useAsyncData(() => api.meetings(), []);
  const collabQuery = useAsyncData(() => api.collaborations(), []);

  async function createMeeting() {
    if (creating) return;
    const title = window.prompt('會議標題?(例如:本週發文規則討論)');
    if (!title?.trim()) return;
    const topic = window.prompt('會議主題/背景?(選填)') ?? undefined;
    const crossBrand = window.confirm('要邀請三個品牌的 AI 代理人一起討論嗎?\n(確定=三品牌跨會議;取消=只邀請目前品牌的 Agent)');
    setCreating(true);
    try {
      const res = await api.createMeeting({
        title: title.trim(),
        topic: topic?.trim() || undefined,
        brandSlug: crossBrand ? undefined : currentBrand?.slug,
        crossBrand,
      });
      await reload();
      navigate(`/meetings/${res.meeting.id}`);
    } catch (e) {
      window.alert(`建立會議失敗:${e instanceof Error ? e.message : '未知錯誤'}`);
    } finally {
      setCreating(false);
    }
  }

  // 小編快閃會議:三位品牌小編 3 分鐘直播式討論
  async function createLiveMeeting() {
    if (creating) return;
    const topic = window.prompt('這場快閃會議要聊什麼?(例如:下週三品牌的發文主題)');
    if (!topic?.trim()) return;
    setCreating(true);
    try {
      const now = new Date();
      const res = await api.createMeeting({
        title: `小編快閃會議 ${now.getMonth() + 1}/${now.getDate()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
        topic: topic.trim(),
        mode: 'live_editors',
      });
      await reload();
      navigate(`/meetings/${res.meeting.id}`);
    } catch (e) {
      window.alert(`建立會議失敗:${e instanceof Error ? e.message : '未知錯誤'}`);
    } finally {
      setCreating(false);
    }
  }

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? '載入失敗'} onRetry={reload} />;

  const collaborations = collabQuery.data?.collaborations ?? [];
  // 跟隨上方品牌切換:單一品牌時只顯示該品牌會議與跨品牌合作會議
  const meetings = currentBrand
    ? data.meetings.filter((m) => m.brandId === currentBrand.id || !m.brandId)
    : data.meetings;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20, alignItems: 'start' }}>
      <div>
        <PageHeader title="AI 會議室" />
        <Button variant="primary" style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }} disabled={creating} onClick={() => void createLiveMeeting()}>
          {creating ? '⏳ 建立中...' : '⚡ 小編快閃會議(3 分鐘直播)'}
        </Button>
        <Button variant="secondary" style={{ width: '100%', justifyContent: 'center', marginBottom: 12 }} disabled={creating} onClick={() => void createMeeting()}>
          + 建立一般會議
        </Button>
        <div style={{ display: 'grid', gap: 10 }}>
          {meetings.map((m) => {
            const scope = m.brandId ? brandById(m.brandId)?.name : collaborations.find((c) => c.id === m.collaborationId)?.title;
            const active = meetingId === m.id;
            return (
              <Link key={m.id} to={`/meetings/${m.id}`} style={{ textDecoration: 'none' }}>
                <Card
                  hoverable
                  style={{ padding: 14, border: active ? '2px solid var(--color-primary)' : '1px solid var(--color-border)' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Badge tone={statusTone[m.status]}>{statusLabel[m.status]}</Badge>
                  </div>
                  <strong style={{ fontSize: 14, color: 'var(--color-text)' }}>{m.title}</strong>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>{scope}</div>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
      <MeetingDetailSlot meetingId={meetingId} />
    </div>
  );
}

function MeetingDetailSlot({ meetingId }: { meetingId?: string }) {
  if (!meetingId) {
    return (
      <Card style={{ minHeight: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p>從左側選擇一個會議查看討論內容</p>
      </Card>
    );
  }
  return <MeetingDetail meetingId={meetingId} />;
}
