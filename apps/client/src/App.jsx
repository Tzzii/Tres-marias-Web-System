import { lazy, Suspense } from 'react';
import { Navigate, Outlet, Route } from 'react-router-dom';
import GlobalStyles from '@mui/material/GlobalStyles';
import { ThemeProvider } from '@mui/material/styles';
import { LightModeScope, NotFoundPage, ScrollToTop, Spinner, paperSurfaceSx } from '@tm/shared';
import { RequireAuth } from './auth.js';
import PortalLayout from './layouts/PortalLayout.jsx';
import AuthLayout from './components/AuthLayout.jsx';
import AuthRouteTransition from './components/AuthRouteTransition.jsx';
import { site, siteTheme } from './theme/siteTheme.js';

import HomePage from './pages/public/HomePage.jsx';
import PackageDetailPage from './pages/public/PackageDetailPage.jsx';
import LoginPage from './pages/public/LoginPage.jsx';
import SignupPage from './pages/public/SignupPage.jsx';
import LegalPage from './pages/public/LegalPage.jsx';

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
const SettingsPage = lazy(() => import('./pages/portal/SettingsPage.jsx'));

export default function App() {
  return (
    <>
      <ScrollToTop />
      <AuthRouteTransition>
        <Route element={<PublicSite />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/packages/:slug" element={<PackageDetailPage />} />
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
          </Route>
          <Route path="/terms" element={<LegalPage kind="terms" />} />
          <Route path="/privacy" element={<LegalPage kind="privacy" />} />
        </Route>

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
          <Route path="settings" element={<Lazy page={SettingsPage} />} />
          <Route path="profile" element={<Navigate to="/portal/settings?tab=account" replace />} />
          <Route path="*" element={<Navigate to="/portal" replace />} />
        </Route>

        <Route path="/register" element={<Navigate to="/signup" replace />} />
        <Route path="*" element={<NotFoundPage homePath="/" homeLabel="Back to Tres Marias" />} />
      </AuthRouteTransition>
    </>
  );
}

function Lazy({ page: Page }) {
  return (
    <Suspense fallback={<Spinner />}>
      <Page />
    </Suspense>
  );
}

function PublicSite() {
  return (
    <LightModeScope>
      <ThemeProvider theme={siteTheme}>
        <GlobalStyles
          styles={{
            body: { ...paperSurfaceSx, backgroundColor: site.ivory, color: site.ink },
            '::selection': { background: 'rgba(197, 160, 89, 0.3)' }
          }}
        />
        <Outlet />
      </ThemeProvider>
    </LightModeScope>
  );
}
