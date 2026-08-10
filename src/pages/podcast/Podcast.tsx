import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { PageHeader } from '@/components/ui/PageHeader';
import type { PodcastEpisode, PodcastSegment, PodcastAgentInfo, PodcastScriptLine } from '@/types';

const STATUS_META: Record<string, { label: string; tone: BadgeTone }> = {
  script_draft: { label: '逐字稿待確認', tone: 'accent' },
  audio_generating: { label: '語音合成中', tone: 'secondary' },
  ready_for_review: { label: '待試聽審核', tone: 'primary' },
  approved: { label: '已核准', tone: 'success' },
  rejected: { label: '已打回', tone: 'danger' },
  archived: { label: '已封存', tone: 'default' },
};

const EMOTION_EMOJI: Record<string, string> = {
  happy: '😊', excited: '🤩', annoyed: '😤', angry: '😠', worried: '😟',
  laughing: '😂', proud: '😎', sad: '😢', confident: '💪', determined: '✊',
  surprised: '😲', moved: '🥹',
};

/** intro / topic1 / outro(含 #2 分段)轉成中文段落標題 */
function segmentTitle(label: string): string {
  const [base, part] = label.split('#');
  const suffix = part ? `(第 ${part} 段)` : '';
  if (base === 'intro') return `開場${suffix}`;
  if (base === 'outro') return `結尾${suffix}`;
  const m = base.match(/^topic(\d+)$/);
  if (m) return `話題 ${m[1]}${suffix}`;
  return `${base}${suffix}`;
}

/** 三位小編的頭像色票(沒有 avatarUrl 時用) */
const FALLBACK_COLORS = ['#C97B4A', '#7C9A6B', '#6B8CAE'];

function HostAvatar({ agent, size = 30, colorIndex = 0 }: { agent?: PodcastAgentInfo; size?: number; colorIndex?: number }) {
  if (agent?.avatarUrl) {
    return <img src={agent.avatarUrl} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />;
  }
  const label = agent?.nickname ?? agent?.displayName ?? '?';
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: agent?.avatarColor ?? FALLBACK_COLORS[colorIndex % FALLBACK_COLORS.length],
      color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: size * 0.42,
    }}>
      {label.slice(0, 1)}
    </div>
  );
}

export function Podcast() {
  const [episodes, setEpisodes] = useState<PodcastEpisode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{
    episode: PodcastEpisode; segments: PodcastSegment[];
    agents: PodcastAgentInfo[]; progress: { total: number; completed: number };
  } | null>(null);
  const [creating, setCreating] = useState(false);
  const [synthesizing, setSynthesizing] = useState(false);
  const [synthProgress, setSynthProgress] = useState<{ completed: number; total: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [themeUrl, setThemeUrl] = useState<string | null>(null);
  const [uploadingTheme, setUploadingTheme] = useState(false);
  const audioRefs = useRef<Map<number, HTMLAudioElement>>(new Map());
  const themeInputRef = useRef<HTMLInputElement>(null);
  const stopSynthRef = useRef(false);

  // 片頭音樂在 audioRefs 中的特殊 key(排在所有段落之前)
  const THEME_ORDER = -1;

  const loadEpisodes = useCallback(async () => {
    const { episodes } = await api.podcastEpisodes();
    setEpisodes(episodes);
    return episodes;
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    const data = await api.podcastEpisode(id);
    setDetail(data);
  }, []);

  useEffect(() => {
    loadEpisodes().then((eps) => {
      if (eps.length) setSelectedId((prev) => prev ?? eps[0].id);
    }).catch((e) => setErrorMsg(e instanceof Error ? e.message : '載入失敗'));
    api.podcastTheme().then(({ url }) => setThemeUrl(url)).catch(() => {});
  }, [loadEpisodes]);

  useEffect(() => {
    if (!selectedId) return;
    setDetail(null);
    loadDetail(selectedId).catch((e) => setErrorMsg(e instanceof Error ? e.message : '載入失敗'));
  }, [selectedId, loadDetail]);

  useEffect(() => () => { stopSynthRef.current = true; }, []);

  const handleCreate = async () => {
    setCreating(true);
    setErrorMsg(null);
    try {
      const result = await api.createPodcastEpisode();
      await loadEpisodes();
      setSelectedId(result.episodeId);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '生成失敗');
    } finally {
      setCreating(false);
    }
  };

  // 逐段合成:每次 API 只做一段(約 30-60 秒),迴圈直到全部完成
  const handleSynthesize = async (episodeId: string) => {
    setSynthesizing(true);
    setErrorMsg(null);
    stopSynthRef.current = false;
    try {
      let done = false;
      while (!done && !stopSynthRef.current) {
        const progress = await api.synthesizePodcastSegment(episodeId);
        setSynthProgress({ completed: progress.completed, total: progress.total });
        done = progress.done;
        await loadDetail(episodeId);
      }
      await loadEpisodes();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '語音合成失敗');
      await loadDetail(episodeId).catch(() => {});
    } finally {
      setSynthesizing(false);
      setSynthProgress(null);
    }
  };

  const handleReview = async (episodeId: string, action: 'approve' | 'reject' | 'archive') => {
    setErrorMsg(null);
    try {
      await api.reviewPodcastEpisode(episodeId, action);
      await Promise.all([loadEpisodes(), loadDetail(episodeId)]);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '操作失敗');
    }
  };

  // 連續播放:一段播完自動接下一段(片頭音樂 order 為 -1,播完自動接開場)
  const handleAudioEnded = (order: number) => {
    if (!detail) return;
    const nextSeg = detail.segments
      .filter((s) => s.audioUrl && s.segmentOrder > order)
      .sort((a, b) => a.segmentOrder - b.segmentOrder)[0];
    if (nextSeg) audioRefs.current.get(nextSeg.segmentOrder)?.play().catch(() => {});
  };

  const playAll = () => {
    if (!detail) return;
    if (themeUrl) {
      const theme = audioRefs.current.get(THEME_ORDER);
      if (theme) { theme.play().catch(() => {}); return; }
    }
    const first = detail.segments.filter((s) => s.audioUrl).sort((a, b) => a.segmentOrder - b.segmentOrder)[0];
    if (first) audioRefs.current.get(first.segmentOrder)?.play().catch(() => {});
  };

  const handleThemeUpload = async (file: File) => {
    setUploadingTheme(true);
    setErrorMsg(null);
    try {
      const { url } = await api.uploadPodcastTheme(file);
      // 加時間戳避免瀏覽器快取到舊音檔
      setThemeUrl(`${url}?v=${Date.now()}`);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '片頭音樂上傳失敗');
    } finally {
      setUploadingTheme(false);
    }
  };

  const agentById = new Map((detail?.agents ?? []).map((a) => [a.id, a]));
  const agentColorIndex = new Map((detail?.agents ?? []).map((a, i) => [a.id, i]));

  // 逐字稿依段落分組
  const scriptGroups: { label: string; lines: PodcastScriptLine[] }[] = [];
  for (const line of detail?.episode.script ?? []) {
    const last = scriptGroups[scriptGroups.length - 1];
    if (last && last.label === line.segmentLabel) last.lines.push(line);
    else scriptGroups.push({ label: line.segmentLabel, lines: [line] });
  }

  const ep = detail?.episode;
  const status = ep ? STATUS_META[ep.status] ?? { label: ep.status, tone: 'default' as BadgeTone } : null;
  const canSynthesize = ep && (ep.status === 'script_draft' || ep.status === 'audio_generating');
  const hasAudio = (detail?.segments ?? []).some((s) => s.audioUrl);

  return (
    <div>
      <PageHeader
        title="Podcast 節目"
        subtitle="三位小編聊近三天熱門話題,每週二、五自動出逐字稿;人工確認後合成語音、試聽審核"
        actions={
          <Button onClick={handleCreate} disabled={creating}>
            {creating ? '生成中(約 1 分鐘)…' : '+ 立刻生成一集'}
          </Button>
        }
      />

      {errorMsg && (
        <Card style={{ marginBottom: 16, borderColor: 'var(--color-danger-soft)', color: '#B85454', fontSize: 13 }}>
          {errorMsg}
        </Card>
      )}

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {/* 左側:集數列表 */}
        <div style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {episodes.length === 0 && (
            <Card style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
              還沒有任何一集。點右上角「立刻生成一集」,或等每週二、五早上 7 點自動生成。
            </Card>
          )}
          {episodes.map((e, i) => {
            const meta = STATUS_META[e.status] ?? { label: e.status, tone: 'default' as BadgeTone };
            const active = e.id === selectedId;
            return (
              <Card
                key={e.id}
                hoverable
                delay={i * 0.03}
                onClick={() => setSelectedId(e.id)}
                style={{
                  cursor: 'pointer', padding: 14,
                  border: active ? '2px solid var(--color-primary)' : undefined,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                    {e.weekOf?.slice(0, 10)} 第 {e.episodeSeq} 集
                  </span>
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                </div>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{e.title ?? '(未命名)'}</div>
                {e.topicSummary && (
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>{e.topicSummary}</div>
                )}
              </Card>
            );
          })}
        </div>

        {/* 右側:單集詳情 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {!selectedId && <Card style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>選一集查看逐字稿與音檔</Card>}
          {selectedId && !detail && <Card style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>載入中…</Card>}

          {ep && status && (
            <>
              <Card style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <h2 style={{ fontSize: 18 }}>{ep.title ?? '(未命名)'}</h2>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </div>
                    {ep.topicSummary && <p style={{ fontSize: 13, marginBottom: 4 }}>{ep.topicSummary}</p>}
                    <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                      {ep.script?.length ?? 0} 句台詞
                      ・音檔 {detail!.progress.completed}/{detail!.progress.total} 段
                    </p>
                    {ep.errorMessage && (
                      <p style={{ fontSize: 12, color: '#B85454', marginTop: 4 }}>上次錯誤:{ep.errorMessage}</p>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    {canSynthesize && (
                      <Button variant="accent" onClick={() => handleSynthesize(ep.id)} disabled={synthesizing}>
                        {synthesizing
                          ? `合成中 ${synthProgress ? `${synthProgress.completed}/${synthProgress.total}` : ''}…`
                          : detail!.progress.completed > 0 ? '繼續合成語音' : '生成語音'}
                      </Button>
                    )}
                    {hasAudio && <Button variant="secondary" onClick={playAll}>▶ 連續播放整集</Button>}
                    {ep.status === 'ready_for_review' && (
                      <>
                        <Button onClick={() => handleReview(ep.id, 'approve')}>核准</Button>
                        <Button variant="danger" onClick={() => handleReview(ep.id, 'reject')}>打回</Button>
                      </>
                    )}
                    {(ep.status === 'approved' || ep.status === 'rejected') && (
                      <Button variant="ghost" onClick={() => handleReview(ep.id, 'archive')}>封存</Button>
                    )}
                  </div>
                </div>
              </Card>

              {/* 逐段音檔播放清單 */}
              {hasAudio && (
                <Card style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <h3 style={{ fontSize: 14 }}>音檔段落(播完自動接下一段)</h3>
                    <input
                      ref={themeInputRef}
                      type="file"
                      accept="audio/*"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleThemeUpload(file);
                        e.target.value = '';
                      }}
                    />
                    <Button variant="ghost" onClick={() => themeInputRef.current?.click()} disabled={uploadingTheme}>
                      {uploadingTheme ? '上傳中…' : themeUrl ? '更換片頭音樂' : '上傳片頭音樂'}
                    </Button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {themeUrl && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, width: 90, flexShrink: 0 }}>🎵 片頭音樂</span>
                        <audio
                          ref={(el) => { if (el) audioRefs.current.set(THEME_ORDER, el); }}
                          controls
                          preload="none"
                          src={themeUrl}
                          onEnded={() => handleAudioEnded(THEME_ORDER)}
                          style={{ flex: 1, height: 36 }}
                        />
                      </div>
                    )}
                    {detail!.segments.filter((s) => s.audioUrl).map((s) => (
                      <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, width: 90, flexShrink: 0 }}>{segmentTitle(s.label)}</span>
                        <audio
                          ref={(el) => { if (el) audioRefs.current.set(s.segmentOrder, el); }}
                          controls
                          preload="none"
                          src={s.audioUrl!}
                          onEnded={() => handleAudioEnded(s.segmentOrder)}
                          style={{ flex: 1, height: 36 }}
                        />
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* 逐字稿 */}
              <Card>
                <h3 style={{ fontSize: 14, marginBottom: 12 }}>逐字稿</h3>
                {scriptGroups.map((group) => (
                  <div key={group.label} style={{ marginBottom: 18 }}>
                    <div style={{
                      fontSize: 12, fontWeight: 700, color: 'var(--color-text-muted)',
                      textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
                      paddingBottom: 4, borderBottom: '1px solid var(--color-border)',
                    }}>
                      {segmentTitle(group.label)}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {group.lines.map((line) => {
                        const agent = agentById.get(line.agentId);
                        const emoji = EMOTION_EMOJI[line.emotion] ?? '';
                        return (
                          <div key={line.order} style={{ display: 'flex', gap: 8 }}>
                            <HostAvatar agent={agent} colorIndex={agentColorIndex.get(line.agentId) ?? 0} size={28} />
                            <div style={{ minWidth: 0 }}>
                              <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                                {line.nickname}{emoji ? ` ${emoji}` : ''}
                              </span>
                              <div style={{
                                fontSize: 13, lineHeight: 1.6, background: 'var(--color-bg-soft)',
                                borderRadius: 10, padding: '8px 12px', marginTop: 2,
                              }}>
                                {line.text}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
