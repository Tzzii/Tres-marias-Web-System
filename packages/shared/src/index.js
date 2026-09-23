/**
 * @tm/shared: everything both portals reuse.
 *
 *   theme/       design tokens (JS + CSS), the dark / light colour schemes and the MUI themes
 *   components/  buttons, inputs, cards, dialogs, calendar, charts, portal shell
 *   hooks/       data loading, countdowns, toasts, page titles
 *   auth/        session provider factory and route guard
 *   services/    the data layer; each xxxApi goes through services/facade/, which picks the
 *                browser store or the API per service (VITE_API_SERVICES, see services/backend.js)
 *   utils/       formatting, status pipeline, validation
 */
export { tokens, eyebrowSx, shakeSx } from './theme/tokens.js';
export { darkPalette, lightPalette } from './theme/palettes.js';
export { darkTheme, lightTheme, warmTheme, themeForMode, surfaceThemeForMode } from './theme/createTheme.js';
export { ColorModeProvider, useColorMode, applyColorMode, readColorMode } from './theme/colorMode.jsx';
export { ThemeModeToggle } from './components/ThemeModeToggle.jsx';

export { LightSurface, DarkSurface } from './components/Surface.jsx';
export { DashCard, CardTitle, StatCard, DetailRow, Field } from './components/DashCard.jsx';
export { Pill, StatusChip, PaymentStatusChip, BalanceChip, FeedbackStatusChip } from './components/Pill.jsx';
export { StatusPipeline } from './components/StatusPipeline.jsx';
export { FieldLabel, FormField, SelectField, PasswordField } from './components/FormField.jsx';
export { BrandLogo, BrandMark, LOGO_SRC } from './components/Brand.jsx';
export { AppDialog, BusyButton, ConfirmDialog } from './components/AppDialog.jsx';
export { OtpInput } from './components/OtpInput.jsx';
export { AlertBanner, EmptyState, ErrorState, Spinner, ListSkeleton } from './components/Feedback.jsx';
export { PageHeader } from './components/PageHeader.jsx';
export { FilterTabs, SearchField } from './components/Filters.jsx';
export { ThemeIcon, themeIconSrc } from './components/ThemeIcon.jsx';
export { StarRating } from './components/StarRating.jsx';
export { MonthCalendar, monthGrid } from './components/MonthCalendar.jsx';
export { DateField } from './components/DateField.jsx';
export { TimeField } from './components/TimeField.jsx';
export { BarChart, RankBars } from './components/BarChart.jsx';
export { DataTable, Pager } from './components/DataTable.jsx';
export { DocumentDialog, documentsFor } from './components/DocumentDialog.jsx';
export { ScrollToTop, NotFoundPage } from './components/Routing.jsx';
export { ChatPanel } from './components/ChatPanel.jsx';
export { default as PortalShell } from './components/PortalShell.jsx';

export { useResource, useStoreVersion } from './hooks/useResource.js';
export { useCountdown, formatCountdown } from './hooks/useCountdown.js';
export { useDocumentTitle } from './hooks/useDocumentTitle.js';
export { NotifyProvider, useNotify } from './hooks/useNotify.jsx';

export { createAuth, safeNextPath } from './auth/createAuth.jsx';

export * from './utils/format.js';
export * from './utils/status.js';
export * from './utils/validation.js';

export { BUSINESS, RULES, OCCASIONS, SERVICE_TYPES, includesFood, RENTAL_SERVICE, isRental, RENTAL, RENTAL_FULFILMENT, DISH_CATEGORIES, BUFFET_DRINKS, MENU_LINE_MAX, DEFAULT_PRICE_PER_PLATE, PRICE_PER_PLATE_RANGE, BLOCK_REASONS, INVENTORY_CATEGORIES, OUTSOURCE_SERVICES, FEEDBACK_CATEGORIES } from './services/config.js';
export { computeQuote, extraGuests, isRentalPackage } from './services/pricing.js';
export { ApiError } from './services/errors.js';
export * as authApi from './services/facade/auth.js';
export * as catalogApi from './services/facade/catalog.js';
export * as calendarApi from './services/facade/calendar.js';
export * as reservationApi from './services/facade/reservation.js';
export * as paymentApi from './services/facade/payment.js';
export * as messageApi from './services/facade/message.js';
export * as customerApi from './services/facade/customer.js';
export * as feedbackApi from './services/facade/feedback.js';
export * as reportApi from './services/facade/report.js';
export * as inventoryApi from './services/facade/inventory.js';
export * as outsourceApi from './services/facade/outsource.js';
