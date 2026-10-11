import { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { MetaProvider } from '@/context/MetaContext';
import { BrandProvider } from '@/context/BrandContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { AppShell } from '@/components/layout/AppShell';
import { RouteBrandSync } from '@/components/layout/RouteBrandSync';
import { LoadingState } from '@/hooks/useAsyncData';
import { lazyPage } from '@/lib/lazy-page';
import { Login } from '@/pages/Login';
import { HomeRedirect } from '@/pages/HomeRedirect';
import { LocaleProvider, useCopy } from '@/pages/public/locale';

const Dashboard = lazyPage(() => import('@/pages/Dashboard'), 'Dashboard');
const BrandWorkspace = lazyPage(() => import('@/pages/brand/BrandWorkspace'), 'BrandWorkspace');
const BrandIntelligence = lazyPage(() => import('@/pages/brand/BrandIntelligence'), 'BrandIntelligence');
const MarketIntelligence = lazyPage(() => import('@/pages/brand/MarketIntelligence'), 'MarketIntelligence');
const Trending = lazyPage(() => import('@/pages/trending/Trending'), 'Trending');
const MeetingList = lazyPage(() => import('@/pages/meeting/MeetingList'), 'MeetingList');
const DecisionCenter = lazyPage(() => import('@/pages/decision/DecisionCenter'), 'DecisionCenter');
const CollaborationList = lazyPage(() => import('@/pages/collaboration/CollaborationList'), 'CollaborationList');
const EcosystemSchedule = lazyPage(() => import('@/pages/collaboration/EcosystemSchedule'), 'EcosystemSchedule');
const Campaigns = lazyPage(() => import('@/pages/campaign/Campaigns'), 'Campaigns');
const ContentCenter = lazyPage(() => import('@/pages/content/ContentCenter'), 'ContentCenter');
const Podcast = lazyPage(() => import('@/pages/podcast/Podcast'), 'Podcast');
const Shorts = lazyPage(() => import('@/pages/shorts/Shorts'), 'Shorts');
const HomigoTutorials = lazyPage(() => import('@/pages/shorts/HomigoTutorials'), 'HomigoTutorials');
const Publishing = lazyPage(() => import('@/pages/publishing/Publishing'), 'Publishing');
const Schedule = lazyPage(() => import('@/pages/publishing/Schedule'), 'Schedule');
const ThreadsReplies = lazyPage(() => import('@/pages/publishing/ThreadsReplies'), 'ThreadsReplies');
const ThreadsDesk = lazyPage(() => import('@/pages/publishing/ThreadsDesk'), 'ThreadsDesk');
const Analytics = lazyPage(() => import('@/pages/analytics/Analytics'), 'Analytics');
const Learning = lazyPage(() => import('@/pages/learning/Learning'), 'Learning');
const Timeline = lazyPage(() => import('@/pages/timeline/Timeline'), 'Timeline');
const Settings = lazyPage(() => import('@/pages/settings/Settings'), 'Settings');
const MetaThreadsPlaybook = lazyPage(() => import('@/pages/settings/MetaThreadsPlaybook'), 'MetaThreadsPlaybook');
const SocialAccounts = lazyPage(() => import('@/pages/settings/SocialAccounts'), 'SocialAccounts');
const AgentPersonas = lazyPage(() => import('@/pages/settings/AgentPersonas'), 'AgentPersonas');
const EventList = lazyPage(() => import('@/pages/event/EventList'), 'EventList');
const EventDetail = lazyPage(() => import('@/pages/event/EventDetail'), 'EventDetail');
const EventRegister = lazyPage(() => import('@/pages/public/EventRegister'), 'EventRegister');
const EventTicket = lazyPage(() => import('@/pages/public/EventTicket'), 'EventTicket');
const CheckinEntry = lazyPage(() => import('@/pages/public/CheckinEntry'), 'CheckinEntry');
const CheckinScan = lazyPage(() => import('@/pages/public/CheckinScan'), 'CheckinScan');
const PrivacyPolicy = lazyPage(() => import('@/pages/public/PrivacyPolicy'), 'PrivacyPolicy');
const BrandCsKnowledge = lazyPage(() => import('@/pages/help/BrandCsKnowledge'), 'BrandCsKnowledge');
const BrandNetwork = lazyPage(() => import('@/pages/network/BrandNetwork'), 'BrandNetwork');
const BrandEditorDesk = lazyPage(() => import('@/pages/editor/BrandEditorDesk'), 'BrandEditorDesk');
const BrandGeo = lazyPage(() => import('@/pages/geo/BrandGeo'), 'BrandGeo');
const BrandSeo = lazyPage(() => import('@/pages/seo/BrandSeo'), 'BrandSeo');
const PostingTimes = lazyPage(() => import('@/pages/brand/PostingTimes'), 'PostingTimes');
const Landing = lazyPage(() => import('@/pages/public/Landing'), 'Landing');
const GoPosting = lazyPage(() => import('@/pages/public/site/GoPosting'), 'GoPosting');
const Proof = lazyPage(() => import('@/pages/public/site/Proof'), 'Proof');
const Show = lazyPage(() => import('@/pages/public/site/Show'), 'Show');
const Jiangcheng = lazyPage(() => import('@/pages/public/site/Jiangcheng'), 'Jiangcheng');
const Center = lazyPage(() => import('@/pages/public/site/Center'), 'Center');
const GameSeasons = lazyPage(() => import('@/pages/settings/GameSeasons'), 'GameSeasons');
const Inquiries = lazyPage(() => import('@/pages/inquiries/Inquiries'), 'Inquiries');

/** 未登入看公開首頁；已登入沿用原本的品牌工作台導向。 */
function RootGate() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingState />;
  if (user) return <Navigate to="/home" replace />;
  return (
    <Suspense fallback={<PublicFallback />}>
      <Landing />
    </Suspense>
  );
}

function PublicFallback() {
  const copy = useCopy();
  return <LoadingState label={copy.common.loading} />;
}

function AppRoutes() {
  return (
    <Suspense fallback={<LoadingState />}>
      <Routes>
        <Route path="/home" element={<HomeRedirect />} />
        <Route path="/overview" element={<Dashboard />} />
        <Route path="/trending" element={<Trending />} />

        <Route path="/:brand/workspace" element={<BrandWorkspace />} />
        <Route path="/:brand/editor" element={<BrandEditorDesk />} />
        <Route path="/:brand/intelligence" element={<BrandIntelligence />} />
        <Route path="/:brand/help" element={<BrandCsKnowledge />} />
        <Route path="/:brand/network" element={<BrandNetwork />} />
        <Route path="/:brand/geo" element={<BrandGeo />} />
        <Route path="/:brand/seo" element={<BrandSeo />} />
        <Route path="/:brand/market" element={<MarketIntelligence />} />
        <Route path="/:brand/campaigns" element={<Campaigns />} />
        <Route path="/:brand/events" element={<EventList />} />
        <Route path="/:brand/events/:id" element={<EventDetail />} />
        <Route path="/:brand/contents" element={<ContentCenter />} />
        <Route path="/:brand/shorts" element={<Shorts />} />
        <Route path="/:brand/tutorials" element={<HomigoTutorials />} />
        <Route path="/:brand/publishing" element={<Publishing />} />
        <Route path="/:brand/schedule" element={<Schedule />} />
        <Route path="/:brand/threads" element={<ThreadsDesk />} />
        <Route path="/:brand/thread-replies" element={<ThreadsReplies />} />
        <Route path="/:brand/social" element={<SocialAccounts />} />
        <Route path="/:brand/posting-times" element={<PostingTimes />} />
        <Route path="/personas" element={<AgentPersonas />} />
        <Route path="/:brand/analytics" element={<Analytics />} />
        <Route path="/:brand/learning" element={<Learning />} />

        <Route path="/podcast" element={<Podcast />} />
        <Route path="/meetings" element={<MeetingList />} />
        <Route path="/meetings/:meetingId" element={<MeetingList />} />
        <Route path="/decisions" element={<DecisionCenter />} />
        <Route path="/collaborations" element={<CollaborationList />} />
        <Route path="/collaborations/:id/schedule" element={<EcosystemSchedule />} />

        <Route path="/timeline" element={<Timeline />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/settings/meta-threads" element={<MetaThreadsPlaybook />} />
        <Route path="/settings/game" element={<GameSeasons />} />
        <Route path="/inquiries" element={<Inquiries />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <LocaleProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<RootGate />} />
          {([
            ['/welcome', Landing],
            ['/go-posting', GoPosting],
            ['/proof', Proof],
            ['/show', Show],
            ['/jiangcheng', Jiangcheng],
            ['/center', Center],
          ] as const).flatMap(([path, Page]) => (
            (['', '/en', '/ja'] as const).map((prefix) => (
              <Route
                key={`${prefix}${path}`}
                path={`${prefix}${path}`}
                element={(
                  <Suspense fallback={<PublicFallback />}>
                    <Page />
                  </Suspense>
                )}
              />
            ))
          ))}
          <Route path="/en" element={(
            <Suspense fallback={<PublicFallback />}>
              <Landing />
            </Suspense>
          )} />
          <Route path="/ja" element={(
            <Suspense fallback={<PublicFallback />}>
              <Landing />
            </Suspense>
          )} />

          <Route
            path="/e/:slug"
            element={(
              <Suspense fallback={<PublicFallback />}>
                <EventRegister />
              </Suspense>
            )}
          />
          <Route
            path="/e/:slug/ticket"
            element={(
              <Suspense fallback={<PublicFallback />}>
                <EventTicket />
              </Suspense>
            )}
          />
          <Route
            path="/checkin"
            element={(
              <Suspense fallback={<PublicFallback />}>
                <CheckinEntry />
              </Suspense>
            )}
          />
          <Route
            path="/checkin/:eventId"
            element={(
              <Suspense fallback={<PublicFallback />}>
                <CheckinScan />
              </Suspense>
            )}
          />

          <Route
            path="/privacy"
            element={(
              <Suspense fallback={<PublicFallback />}>
                <PrivacyPolicy />
              </Suspense>
            )}
          />
          <Route
            path="/privacy/:brand"
            element={(
              <Suspense fallback={<PublicFallback />}>
                <PrivacyPolicy />
              </Suspense>
            )}
          />

          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <MetaProvider>
                  <BrandProvider>
                    <AppShell>
                      <Routes>
                        <Route path="/:brand/*" element={<RouteBrandSync />} />
                      </Routes>
                      <AppRoutes />
                    </AppShell>
                  </BrandProvider>
                </MetaProvider>
              </ProtectedRoute>
            }
          />
        </Routes>
        </LocaleProvider>
      </BrowserRouter>
    </AuthProvider>
  );
}
