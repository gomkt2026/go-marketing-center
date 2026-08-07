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
import { MeetingList } from '@/pages/meeting/MeetingList';
import { DecisionCenter } from '@/pages/decision/DecisionCenter';
import { CollaborationList } from '@/pages/collaboration/CollaborationList';
import { Campaigns } from '@/pages/campaign/Campaigns';
import { ContentCenter } from '@/pages/content/ContentCenter';
import { Publishing } from '@/pages/publishing/Publishing';
import { Analytics } from '@/pages/analytics/Analytics';
import { Learning } from '@/pages/learning/Learning';
import { Timeline } from '@/pages/timeline/Timeline';
import { Settings } from '@/pages/settings/Settings';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
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

                        <Route path="/:brand/workspace" element={<BrandWorkspace />} />
                        <Route path="/:brand/intelligence" element={<BrandIntelligence />} />
                        <Route path="/:brand/market" element={<MarketIntelligence />} />
                        <Route path="/:brand/campaigns" element={<Campaigns />} />
                        <Route path="/:brand/contents" element={<ContentCenter />} />
                        <Route path="/:brand/publishing" element={<Publishing />} />
                        <Route path="/:brand/analytics" element={<Analytics />} />
                        <Route path="/:brand/learning" element={<Learning />} />

                        <Route path="/meetings" element={<MeetingList />} />
                        <Route path="/meetings/:meetingId" element={<MeetingList />} />
                        <Route path="/decisions" element={<DecisionCenter />} />
                        <Route path="/collaborations" element={<CollaborationList />} />

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
