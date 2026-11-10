import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './features/auth/AuthContext';
import LoginPage from './features/auth/LoginPage';
import Layout from './components/Layout';
import { Loading } from './components/ui';
import DashboardPage from './features/dashboard/DashboardPage';
import PatientsPage from './features/patients/PatientsPage';
import AppointmentsPage from './features/appointments/AppointmentsPage';
import BillingPage, { ReceiptPage } from './features/billing/BillingPage';
import CopilotPage from './features/copilot/CopilotPage';
import SettingsPage from './features/auth/SettingsPage';
export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <LoginPage />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="patients" element={<PatientsPage />} />
        <Route path="appointments" element={<AppointmentsPage />} />
        <Route path="billing" element={<BillingPage />} />
        <Route path="receipts/:id" element={<ReceiptPage />} />
        <Route
          path="copilot"
          element={user.role === 'ADMIN' ? <CopilotPage /> : <Navigate to="/" replace />}
        />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
