import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { SyncProvider } from './context/SyncContext';
import { AppShell } from './components/layout/AppShell';
import { WorkOrdersPage } from './pages/WorkOrdersPage';
import { WorkOrderDetailPage } from './pages/WorkOrderDetailPage';
import { SyncStatusPage } from './pages/SyncStatusPage';
import { SplashScreen } from './components/SplashScreen';

export default function App() {
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  if (showSplash) return <SplashScreen />;

  return (
    <BrowserRouter>
      <SyncProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<WorkOrdersPage />} />
            <Route path="/wo/:id" element={<WorkOrderDetailPage />} />
            <Route path="/sync" element={<SyncStatusPage />} />
          </Route>
        </Routes>
      </SyncProvider>
    </BrowserRouter>
  );
}
