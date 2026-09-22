import { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { MetaProvider } from '@/context/MetaContext';
import { BrandProvider } from '@/context/BrandContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { AppShell } from '@/components/layout/AppShell';
import { RouteBrandSync } from '@/components/layout/RouteBrandSync';
import { LoadingState } from '@/hooks/useAsyncData';
import { lazyPage } from '@/lib/lazy-page';
import { Login } from '@/pages/Login';
import { HomeRedirect } from '@/pages/HomeRedirect';

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

function AppRoutes() {
  return (
    <Suspense fallback={<LoadingState />}>
      <Routes>
        <Route path="/" element={<HomeRedirect />} />
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

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            path="/e/:slug"
            element={(
              <Suspense fallback={<LoadingState />}>
                <EventRegister />
              </Suspense>
            )}
          />
          <Route
            path="/e/:slug/ticket"
            element={(
              <Suspense fallback={<LoadingState />}>
                <EventTicket />
              </Suspense>
            )}
          />
          <Route
            path="/checkin"
            element={(
              <Suspense fallback={<LoadingState />}>
                <CheckinEntry />
              </Suspense>
            )}
          />
          <Route
            path="/checkin/:eventId"
            element={(
              <Suspense fallback={<LoadingState />}>
                <CheckinScan />
              </Suspense>
            )}
          />

          <Route
            path="/privacy"
            element={(
              <Suspense fallback={<LoadingState />}>
                <PrivacyPolicy />
              </Suspense>
            )}
          />
          <Route
            path="/privacy/:brand"
            element={(
              <Suspense fallback={<LoadingState />}>
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
      </BrowserRouter>
    </AuthProvider>
  );
}
