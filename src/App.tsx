import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { MetaProvider } from '@/context/MetaContext';
import { BrandProvider } from '@/context/BrandContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { AppShell } from '@/components/layout/AppShell';
import { RouteBrandSync } from '@/components/layout/RouteBrandSync';
import { Login } from '@/pages/Login';
import { Dashboard } from '@/pages/Dashboard';
import { BrandWorkspace } from '@/pages/brand/BrandWorkspace';
import { BrandIntelligence } from '@/pages/brand/BrandIntelligence';
import { MarketIntelligence } from '@/pages/brand/MarketIntelligence';
import { Trending } from '@/pages/trending/Trending';
import { MeetingList } from '@/pages/meeting/MeetingList';
import { DecisionCenter } from '@/pages/decision/DecisionCenter';
import { CollaborationList } from '@/pages/collaboration/CollaborationList';
import { EcosystemSchedule } from '@/pages/collaboration/EcosystemSchedule';
import { Campaigns } from '@/pages/campaign/Campaigns';
import { ContentCenter } from '@/pages/content/ContentCenter';
import { Podcast } from '@/pages/podcast/Podcast';
import { Shorts } from '@/pages/shorts/Shorts';
import { Publishing } from '@/pages/publishing/Publishing';
import { Schedule } from '@/pages/publishing/Schedule';
import { ThreadsReplies } from '@/pages/publishing/ThreadsReplies';
import { Analytics } from '@/pages/analytics/Analytics';
import { Learning } from '@/pages/learning/Learning';
import { Timeline } from '@/pages/timeline/Timeline';
import { Settings } from '@/pages/settings/Settings';
import { SocialAccounts } from '@/pages/settings/SocialAccounts';
import { AgentPersonas } from '@/pages/settings/AgentPersonas';
import { EventList } from '@/pages/event/EventList';
import { EventDetail } from '@/pages/event/EventDetail';
import { EventRegister } from '@/pages/public/EventRegister';
import { EventTicket } from '@/pages/public/EventTicket';
import { CheckinEntry } from '@/pages/public/CheckinEntry';
import { CheckinScan } from '@/pages/public/CheckinScan';
import { PrivacyPolicy } from '@/pages/public/PrivacyPolicy';
import { BrandCsKnowledge } from '@/pages/help/BrandCsKnowledge';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          {/* 公開活動報名/報到頁面(無需登入) */}
          <Route path="/e/:slug" element={<EventRegister />} />
          <Route path="/e/:slug/ticket" element={<EventTicket />} />
          <Route path="/checkin" element={<CheckinEntry />} />
          <Route path="/checkin/:eventId" element={<CheckinScan />} />

          {/* 公開隱私權政策(供 Meta App Review 使用,無需登入) */}
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/privacy/:brand" element={<PrivacyPolicy />} />

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
                      <Routes>
                        <Route path="/" element={<Dashboard />} />
                        <Route path="/trending" element={<Trending />} />

                        <Route path="/:brand/workspace" element={<BrandWorkspace />} />
                        <Route path="/:brand/intelligence" element={<BrandIntelligence />} />
                        <Route path="/:brand/help" element={<BrandCsKnowledge />} />
                        <Route path="/:brand/market" element={<MarketIntelligence />} />
                        <Route path="/:brand/campaigns" element={<Campaigns />} />
                        <Route path="/:brand/events" element={<EventList />} />
                        <Route path="/:brand/events/:id" element={<EventDetail />} />
                        <Route path="/:brand/contents" element={<ContentCenter />} />
                        <Route path="/:brand/shorts" element={<Shorts />} />
                        <Route path="/:brand/publishing" element={<Publishing />} />
                        <Route path="/:brand/schedule" element={<Schedule />} />
                        <Route path="/:brand/thread-replies" element={<ThreadsReplies />} />
                        <Route path="/:brand/social" element={<SocialAccounts />} />
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

                        <Route path="*" element={<Navigate to="/" replace />} />
                      </Routes>
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
