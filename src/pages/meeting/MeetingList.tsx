import { Link, useParams } from 'react-router-dom';
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
  const { brandById } = useBrand();
  const { data, loading, error, reload } = useAsyncData(() => api.meetings(), []);
  const collabQuery = useAsyncData(() => api.collaborations(), []);

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? '載入失敗'} onRetry={reload} />;

  const collaborations = collabQuery.data?.collaborations ?? [];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20, alignItems: 'start' }}>
      <div>
        <PageHeader title="AI 會議室" />
        <Button variant="primary" style={{ width: '100%', justifyContent: 'center', marginBottom: 12 }}>+ 建立會議</Button>
        <div style={{ display: 'grid', gap: 10 }}>
          {data.meetings.map((m) => {
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
