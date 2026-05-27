import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { SyncProvider } from './context/SyncContext';
import { AppShell } from './components/layout/AppShell';
import { WorkOrdersPage } from './pages/WorkOrdersPage';
import { WorkOrderDetailPage } from './pages/WorkOrderDetailPage';
import { SyncStatusPage } from './pages/SyncStatusPage';

export default function App() {
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
