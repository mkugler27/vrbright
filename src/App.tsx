import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ErrorProvider } from './context/ErrorContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppShell } from './components/layout/AppShell';
import { AppFrame } from './components/layout/AppFrame';
import { LoginPage } from './pages/LoginPage';
import { TeamPage } from './pages/TeamPage';
import { DashboardHome } from './pages/DashboardHome';
import { SplashScreen } from './components/SplashScreen';
import { ErrorToast } from './components/ui/ErrorToast';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
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
          <AppFrame>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route
                element={
                  <ProtectedRoute>
                    <AppShell />
                  </ProtectedRoute>
                }
              >
                <Route path="/" element={<DashboardHome />} />
                <Route path="/wo" element={<PlaceholderPage title="Working Orders" />} />
                <Route path="/chat" element={<PlaceholderPage title="Chat" />} />
                <Route path="/finance" element={<PlaceholderPage title="Finance" />} />
                <Route path="/team" element={<TeamPage />} />
                <Route path="/clients" element={<PlaceholderPage title="Clients" />} />
                <Route path="/pre-proposal" element={<PlaceholderPage title="Pre-Proposal" />} />
                <Route path="/supervisors" element={<PlaceholderPage title="Supervisors" />} />
              </Route>
            </Routes>
          </AppFrame>
        </AuthProvider>
      </BrowserRouter>
    </ErrorProvider>
  );
}