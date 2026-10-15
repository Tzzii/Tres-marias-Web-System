import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { NotFoundPage, ScrollToTop, Spinner } from '@tm/shared';
import { RequireAuth } from './auth.js';
import AdminLayout from './layouts/AdminLayout.jsx';
import LoginPage from './pages/LoginPage.jsx';
import SplashPage from './pages/SplashPage.jsx';
import UnlockPage from './pages/UnlockPage.jsx';

const DashboardPage = lazy(() => import('./pages/DashboardPage.jsx'));
const ReservationsPage = lazy(() => import('./pages/ReservationsPage.jsx'));
const CalendarPage = lazy(() => import('./pages/CalendarPage.jsx'));
const ReservationDetailPage = lazy(() => import('./pages/ReservationDetailPage.jsx'));
const PackagesPage = lazy(() => import('./pages/PackagesPage.jsx'));
const InventoryPage = lazy(() => import('./pages/InventoryPage.jsx'));
const CustomersPage = lazy(() => import('./pages/CustomersPage.jsx'));
const OutsourcePage = lazy(() => import('./pages/OutsourcePage.jsx'));
const MessagesPage = lazy(() => import('./pages/MessagesPage.jsx'));
const ReportsPage = lazy(() => import('./pages/ReportsPage.jsx'));
const PaymentsPage = lazy(() => import('./pages/PaymentsPage.jsx'));
const FeedbacksPage = lazy(() => import('./pages/FeedbacksPage.jsx'));
const SettingsPage = lazy(() => import('./pages/SettingsPage.jsx'));

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<SplashPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/locked" element={<UnlockPage />} />

        <Route
          element={
            <RequireAuth>
              <AdminLayout />
            </RequireAuth>
          }
        >
          <Route path="dashboard" element={<Lazy page={DashboardPage} />} />
          <Route path="reservations" element={<ReservationsRoute />} />
          <Route path="calendar" element={<Lazy page={CalendarPage} />} />
          <Route path="reservations/:ref" element={<Lazy page={ReservationDetailPage} />} />
          <Route path="packages" element={<Lazy page={PackagesPage} />} />
          <Route path="inventory" element={<Lazy page={InventoryPage} />} />
          <Route path="customers" element={<Lazy page={CustomersPage} />} />
          <Route path="outsource" element={<Lazy page={OutsourcePage} />} />
          <Route path="messages" element={<Lazy page={MessagesPage} />} />
          <Route path="reports" element={<ReportsRoute />} />
          <Route path="payments" element={<Lazy page={PaymentsPage} />} />
          <Route path="feedbacks" element={<Lazy page={FeedbacksPage} />} />
          <Route path="settings" element={<Lazy page={SettingsPage} />} />
          <Route path="account" element={<Navigate to="/settings?tab=account" replace />} />
          <Route path="requests" element={<TabRedirect to="/reservations" tab="requests" />} />
        </Route>
        <Route path="*" element={<NotFoundPage homePath="/dashboard" homeLabel="Back to the dashboard" />} />
      </Routes>
    </>
  );
}

function ReservationsRoute() {
  const { search, hash } = useLocation();
  const params = new URLSearchParams(search);
  if (params.get('tab') === 'calendar') {
    params.delete('tab');
    const query = params.toString();
    return <Navigate to={`/calendar${query ? `?${query}` : ''}${hash}`} replace />;
  }
  return <Lazy page={ReservationsPage} />;
}

function ReportsRoute() {
  const { search, hash } = useLocation();
  const params = new URLSearchParams(search);
  const tab = params.get('tab');
  if (tab === 'payments' || (tab !== 'overview' && (params.get('verify') || params.get('filter')))) {
    params.delete('tab');
    const query = params.toString();
    return <Navigate to={`/payments${query ? `?${query}` : ''}${hash}`} replace />;
  }
  return <Lazy page={ReportsPage} />;
}

function TabRedirect({ to, tab }) {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  params.set('tab', tab);
  return <Navigate to={`${to}?${params}`} replace />;
}

function Lazy({ page: Page }) {
  return (
    <Suspense fallback={<Spinner />}>
      <Page />
    </Suspense>
  );
}
