import { lazy, Suspense } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import GlobalStyles from '@mui/material/GlobalStyles';
import { ThemeProvider } from '@mui/material/styles';
import { NotFoundPage, ScrollToTop, Spinner } from '@tm/shared';
import { RequireAuth } from './auth.js';
import PortalLayout from './layouts/PortalLayout.jsx';
import { site, siteTheme } from './theme/siteTheme.js';

import HomePage from './pages/public/HomePage.jsx';
import PackageDetailPage from './pages/public/PackageDetailPage.jsx';
import LoginPage from './pages/public/LoginPage.jsx';
import SignupPage from './pages/public/SignupPage.jsx';

// Portal pages load on demand so the public site stays light
const DashboardPage = lazy(() => import('./pages/portal/DashboardPage.jsx'));
const ReservationsPage = lazy(() => import('./pages/portal/ReservationsPage.jsx'));
const ReservationDetailPage = lazy(() => import('./pages/portal/ReservationDetailPage.jsx'));
const BookEventPage = lazy(() => import('./pages/portal/BookEventPage.jsx'));
const CalendarPage = lazy(() => import('./pages/portal/CalendarPage.jsx'));
const PaymentsPage = lazy(() => import('./pages/portal/PaymentsPage.jsx'));
const DocumentsPage = lazy(() => import('./pages/portal/DocumentsPage.jsx'));
const MessagesPage = lazy(() => import('./pages/portal/MessagesPage.jsx'));
const PackagesPage = lazy(() => import('./pages/portal/PackagesPage.jsx'));
const TestimonialsPage = lazy(() => import('./pages/portal/TestimonialsPage.jsx'));
const ProfilePage = lazy(() => import('./pages/portal/ProfilePage.jsx'));

/**
 * Customer Portal routes.
 *   Public:  /  /packages/:slug  /login  /signup  (light website theme, see PublicSite)
 *   Account: /portal/*  (signed-in customers only)
 */
export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        {/* Public pages: anyone can visit. They use the light "Warm Ivory & Gold" website theme. */}
        <Route element={<PublicSite />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/packages/:slug" element={<PackageDetailPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
        </Route>

        {/* Customer portal: RequireAuth sends signed-out visitors to /login, PortalLayout draws the sidebar */}
        <Route
          path="/portal"
          element={
            <RequireAuth>
              <PortalLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Lazy page={DashboardPage} />} />
          <Route path="reservations" element={<Lazy page={ReservationsPage} />} />
          <Route path="reservations/:ref" element={<Lazy page={ReservationDetailPage} />} />
          <Route path="book" element={<Lazy page={BookEventPage} />} />
          <Route path="calendar" element={<Lazy page={CalendarPage} />} />
          <Route path="payments" element={<Lazy page={PaymentsPage} />} />
          <Route path="documents" element={<Lazy page={DocumentsPage} />} />
          <Route path="messages" element={<Lazy page={MessagesPage} />} />
          <Route path="packages" element={<Lazy page={PackagesPage} />} />
          <Route path="testimonials" element={<Lazy page={TestimonialsPage} />} />
          <Route path="profile" element={<Lazy page={ProfilePage} />} />
          {/* Unknown portal URLs go back to the portal dashboard */}
          <Route path="*" element={<Navigate to="/portal" replace />} />
        </Route>

        {/* Old /register link redirects to /signup; everything else shows the 404 page */}
        <Route path="/register" element={<Navigate to="/signup" replace />} />
        <Route path="*" element={<NotFoundPage homePath="/" homeLabel="Back to Tres Marias" />} />
      </Routes>
    </>
  );
}

/** Wraps a lazy page so a loading spinner shows while its code is downloading. */
function Lazy({ page: Page }) {
  return (
    <Suspense fallback={<Spinner />}>
      <Page />
    </Suspense>
  );
}

/**
 * Wraps the public pages in the light website theme (theme/siteTheme.js) and paints the page
 * behind them ivory, so over-scrolling never shows the portal's navy. The portal keeps the navy theme.
 */
function PublicSite() {
  return (
    <ThemeProvider theme={siteTheme}>
      <GlobalStyles styles={{ body: { backgroundColor: site.ivory, color: site.ink }, '::selection': { background: 'rgba(197, 160, 89, 0.3)' } }} />
      <Outlet />
    </ThemeProvider>
  );
}
