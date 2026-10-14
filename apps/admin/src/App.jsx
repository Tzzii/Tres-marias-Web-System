import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { NotFoundPage, ScrollToTop, Spinner } from '@tm/shared';
import { RequireAuth } from './auth.js';
import AdminLayout from './layouts/AdminLayout.jsx';
import LoginPage from './pages/LoginPage.jsx';
import SplashPage from './pages/SplashPage.jsx';
import UnlockPage from './pages/UnlockPage.jsx';

const DashboardPage = lazy(() => import('./pages/DashboardPage.jsx'));
const ReservationsCalendarPage = lazy(() => import('./pages/ReservationsCalendarPage.jsx'));
const ReservationDetailPage = lazy(() => import('./pages/ReservationDetailPage.jsx'));
const PackagesPage = lazy(() => import('./pages/PackagesPage.jsx'));
const InventoryPage = lazy(() => import('./pages/InventoryPage.jsx'));
const CustomersPage = lazy(() => import('./pages/CustomersPage.jsx'));
const OutsourcePage = lazy(() => import('./pages/OutsourcePage.jsx'));
const MessagesPage = lazy(() => import('./pages/MessagesPage.jsx'));
const ReportsPage = lazy(() => import('./pages/ReportsPage.jsx'));
const FeedbacksPage = lazy(() => import('./pages/FeedbacksPage.jsx'));
const AccountPage = lazy(() => import('./pages/AccountPage.jsx'));

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
          <Route path="reservations" element={<Lazy page={ReservationsCalendarPage} />} />
          <Route path="reservations/:ref" element={<Lazy page={ReservationDetailPage} />} />
          <Route path="packages" element={<Lazy page={PackagesPage} />} />
          <Route path="inventory" element={<Lazy page={InventoryPage} />} />
          <Route path="customers" element={<Lazy page={CustomersPage} />} />
          <Route path="outsource" element={<Lazy page={OutsourcePage} />} />
          <Route path="messages" element={<Lazy page={MessagesPage} />} />
          <Route path="reports" element={<Lazy page={ReportsPage} />} />
          <Route path="feedbacks" element={<Lazy page={FeedbacksPage} />} />
          <Route path="account" element={<Lazy page={AccountPage} />} />
          <Route path="requests" element={<TabRedirect to="/reservations" tab="requests" />} />
          <Route path="calendar" element={<TabRedirect to="/reservations" tab="calendar" />} />
          <Route path="payments" element={<TabRedirect to="/reports" tab="payments" />} />
        </Route>
        <Route path="*" element={<NotFoundPage homePath="/dashboard" homeLabel="Back to the dashboard" />} />
      </Routes>
    </>
  );
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
