import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { NotFoundPage, ScrollToTop, Spinner } from '@tm/shared';
import { RequireAuth } from './auth.js';
import { useMessenger } from './components/MessagesWidget.jsx';
import AdminLayout from './layouts/AdminLayout.jsx';
import LoginPage from './pages/LoginPage.jsx';
import SplashPage from './pages/SplashPage.jsx';

// Each page is lazy-loaded: its code is only downloaded the first time the admin opens it.
const DashboardPage = lazy(() => import('./pages/DashboardPage.jsx'));
const ReservationsCalendarPage = lazy(() => import('./pages/ReservationsCalendarPage.jsx'));
const ReservationDetailPage = lazy(() => import('./pages/ReservationDetailPage.jsx'));
const PackagesPage = lazy(() => import('./pages/PackagesPage.jsx'));
const InventoryPage = lazy(() => import('./pages/InventoryPage.jsx'));
const CustomersPage = lazy(() => import('./pages/CustomersPage.jsx'));
const OutsourcePage = lazy(() => import('./pages/OutsourcePage.jsx'));
const ReportsPage = lazy(() => import('./pages/ReportsPage.jsx'));
const FeedbacksPage = lazy(() => import('./pages/FeedbacksPage.jsx'));
const AccountPage = lazy(() => import('./pages/AccountPage.jsx'));

/**
 * Admin Dashboard routes. Everything except / and /login requires an admin session.
 * Reservation requests, all reservations and the calendar share /reservations (as tabs);
 * payments is a tab of /reports; contracts and partners share /outsource (as tabs);
 * customer reviews have their own page at /feedbacks.
 * The old /requests, /calendar and /payments URLs redirect there.
 */
export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        {/* Public routes: the logo splash screen (first page) and the admin sign-in screen */}
        <Route path="/" element={<SplashPage />} />
        <Route path="/login" element={<LoginPage />} />
        {/* Protected routes: RequireAuth sends signed-out users to /login (or to the / logo screen after a 15-minute idle timeout); AdminLayout draws the sidebar and top bar */}
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
          {/* Messages is a top-bar chat window now; the old address opens it full screen */}
          <Route path="messages" element={<MessagesRedirect />} />
          <Route path="reports" element={<Lazy page={ReportsPage} />} />
          <Route path="feedbacks" element={<Lazy page={FeedbacksPage} />} />
          <Route path="account" element={<Lazy page={AccountPage} />} />
          {/* Old addresses of pages that became tabs */}
          <Route path="requests" element={<TabRedirect to="/reservations" tab="requests" />} />
          <Route path="calendar" element={<TabRedirect to="/reservations" tab="calendar" />} />
          <Route path="payments" element={<TabRedirect to="/reports" tab="payments" />} />
        </Route>
        {/* Any unknown URL shows the 404 page */}
        <Route path="*" element={<NotFoundPage homePath="/dashboard" homeLabel="Back to the dashboard" />} />
      </Routes>
    </>
  );
}

/** Sends an old page address to the page and tab that replaced it, keeping any other URL options (e.g. ?verify=). */
function TabRedirect({ to, tab }) {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  params.set('tab', tab);
  return <Navigate to={`${to}?${params}`} replace />;
}

/** Old /messages?thread=ID links: open the chat window full screen on that thread, over the dashboard. */
function MessagesRedirect() {
  const { search } = useLocation();
  const { openMessages } = useMessenger();
  useEffect(() => {
    openMessages(new URLSearchParams(search).get('thread'), 'full');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <Navigate to="/dashboard" replace />;
}

/** Wraps a lazy page so a loading spinner shows while its code is downloading. */
function Lazy({ page: Page }) {
  return (
    <Suspense fallback={<Spinner />}>
      <Page />
    </Suspense>
  );
}
