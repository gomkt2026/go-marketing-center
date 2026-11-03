import { Link, Navigate, useParams } from 'react-router-dom';
import { useBrand } from '@/context/BrandContext';
import { api } from '@/lib/api';
import { useAsyncData, LoadingState, ErrorState } from '@/hooks/useAsyncData';
import type { Content } from '@/types';
import './bbbox-center.css';

const PLATFORM: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  threads: 'Threads',
};

function latest(content: Content) {
  return content.versions[content.versions.length - 1];
}

function imageOf(content: Content) {
  const version = latest(content);
  return version?.assets?.find((asset) => asset.assetType === 'image')?.fileUrl ?? null;
}

function excerpt(body: string) {
  const flat = body.replace(/\s+/g, ' ').trim();
  return flat.length > 140 ? `${flat.slice(0, 140)}…` : flat;
}

export function BbboxCenter() {
  const { brand: slug } = useParams();
  const { brandBySlug, brandsLoading } = useBrand();
  const brand = slug ? brandBySlug(slug) : undefined;
  const query = useAsyncData(async () => {
    if (slug !== 'bbbox') return { drafts: [] as Content[] };
    const list = await api.contents('bbbox', { status: 'draft' });
    const details = await Promise.all(list.contents.slice(0, 6).map((item) => api.contentDetail(item.id)));
    const order = ['facebook', 'instagram', 'threads'];
    return {
      drafts: details
        .map((item) => item.content)
        .sort((a, b) => order.indexOf(a.targetPlatform ?? '') - order.indexOf(b.targetPlatform ?? '')),
    };
  }, [slug]);

  if (slug !== 'bbbox') return <Navigate to="/office" replace />;
  if (!brand) return brandsLoading ? <LoadingState /> : <Navigate to="/office" replace />;
  if (query.error && !query.data) return <ErrorState message={query.error} onRetry={query.reload} />;

  const drafts = query.data?.drafts ?? [];

  return (
    <div className="bbbox-center">
      <header className="bbbox-hero">
        <img src="/brands/bbbox-logo.png" alt="BB BOX" />
        <div>
          <p className="bbbox-kicker">小盒 · 只負責這一牌</p>
          <h1>和居家居行銷中心</h1>
          <p>社群稿留在這一層等人看過。預約賞屋請留 04-2355-0256，或 LINE @BBBOX。</p>
        </div>
      </header>

      <nav className="bbbox-links" aria-label="和居家居工作">
        <Link to="/bbbox/intelligence">品牌智慧</Link>
        <Link to="/bbbox/editor">跟小盒聊</Link>
        <Link to="/bbbox/contents">全部草稿</Link>
      </nav>

      {query.loading && !query.data ? <LoadingState label="正在打開和居家居的草稿…" /> : (
        <section className="bbbox-drafts" aria-label="社群草稿">
          {drafts.length === 0 ? (
            <p className="bbbox-empty">這一層還沒有草稿。先到品牌智慧對過事實，再請小盒寫一則。</p>
          ) : drafts.map((content) => {
            const version = latest(content);
            const image = imageOf(content);
            const platform = PLATFORM[content.targetPlatform ?? ''] ?? '社群';
            return (
              <article key={content.id} className="bbbox-card">
                {image ? <img src={image} alt="" /> : <div className="bbbox-card-blank">{platform}</div>}
                <div className="bbbox-card-body">
                  <span>{platform} · 草稿</span>
                  <h2>{content.title}</h2>
                  {version?.body && <p>{excerpt(version.body)}</p>}
                  {version?.cta && <small>{version.cta}</small>}
                  <Link to="/bbbox/contents">到草稿工作台</Link>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
