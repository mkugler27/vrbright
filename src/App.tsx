import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ErrorProvider } from './context/ErrorContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ActiveConversationProvider } from './context/ActiveConversationContext';
import { UnreadProvider } from './context/UnreadContext';
import { PresenceProvider } from './context/PresenceContext';
import { AppShell } from './components/layout/AppShell';
import { AppFrame } from './components/layout/AppFrame';
import { LoginPage } from './pages/LoginPage';
import { TeamPage } from './pages/TeamPage';
import { DashboardHome } from './pages/DashboardHome';
import { WOPage } from './pages/WOPage';
import ChatPage from './pages/ChatPage';
import NewChatPage from './pages/NewChatPage';
import NewGroupPage from './pages/NewGroupPage';
import { AdjustmentPage } from './pages/AdjustmentPage';
import { SplashScreen } from './components/SplashScreen';
import { ErrorToast } from './components/ui/ErrorToast';

// Admin Shell & Pages
import { AdminShell } from './components/layout/AdminShell';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AdminClients } from './pages/admin/AdminClients';
import { AdminProposals } from './pages/admin/AdminProposals';
import { AdminPriceList } from './pages/admin/AdminPriceList';
import { AdminUsers } from './pages/admin/AdminUsers';
import { AdminFinance } from './pages/admin/AdminFinance';
import { AdminCalendar } from './pages/admin/AdminCalendar';
import { AdminWorklist } from './pages/admin/AdminWorklist';
import { AdminSettings } from './pages/admin/AdminSettings';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  
  const isAdmin = ['owner', 'director', 'manager'].includes((user.tipo_user_bubble || '').toLowerCase());
  if (!isAdmin) return <Navigate to="/" replace />;
  
  return <>{children}</>;
}

function DashboardHomeWrapper() {
  const { user } = useAuth();
  const isAdmin = ['owner', 'director', 'manager'].includes((user?.tipo_user_bubble || '').toLowerCase());
  if (isAdmin) return <Navigate to="/admin" replace />;
  return <DashboardHome />;
}

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="p-5">
      <h2 className="text-xl font-bold text-gray-800 mb-1">{title}</h2>
      <p className="text-sm text-gray-500">Coming soon.</p>
    </div>
  );
}

export default function App() {
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  if (showSplash) return <SplashScreen />;

  return (
    <ErrorProvider>
      <BrowserRouter>
        <ErrorToast />
        <AuthProvider>
          <PresenceProvider>
            <ActiveConversationProvider>
              <UnreadProvider>
                <AppFrame>
                  <Routes>
                    <Route path="/login" element={<LoginPage />} />
                    
                    {/* Worker Routes */}
                    <Route
                      element={
                        <ProtectedRoute>
                          <AppShell />
                        </ProtectedRoute>
                      }
                    >
                      <Route path="/" element={<DashboardHomeWrapper />} />
                      <Route path="/wo" element={<WOPage />} />
                      <Route path="/chat" element={<ChatPage />} />
                      <Route path="/chat/new" element={<NewChatPage />} />
                      <Route path="/chat/groups/new" element={<NewGroupPage />} />
                      <Route path="/finance" element={<PlaceholderPage title="Finance" />} />
                      <Route path="/adjustments" element={<AdjustmentPage />} />
                      <Route path="/team" element={<TeamPage />} />
                      <Route path="/clients" element={<PlaceholderPage title="Clients" />} />
                      <Route path="/pre-proposal" element={<PlaceholderPage title="Pre-Proposal" />} />
                      <Route path="/supervisors" element={<PlaceholderPage title="Supervisors" />} />
                    </Route>

                    {/* Admin Routes */}
                    <Route
                      element={
                        <AdminProtectedRoute>
                          <AdminShell />
                        </AdminProtectedRoute>
                      }
                    >
                      <Route path="/admin" element={<AdminDashboard />} />
                      <Route path="/admin/clients" element={<AdminClients />} />
                      <Route path="/admin/proposals" element={<AdminProposals />} />
                      <Route path="/admin/price-list" element={<AdminPriceList />} />
                      <Route path="/admin/users" element={<AdminUsers />} />
                      <Route path="/admin/finance" element={<AdminFinance />} />
                      <Route path="/admin/calendar" element={<AdminCalendar />} />
                      <Route path="/admin/worklist" element={<AdminWorklist />} />
                      <Route path="/admin/settings" element={<AdminSettings />} />
                    </Route>
                  </Routes>
                </AppFrame>
              </UnreadProvider>
            </ActiveConversationProvider>
          </PresenceProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorProvider>
  );
}