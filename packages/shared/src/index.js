/**
 * @tm/shared: everything both portals reuse.
 *
 *   theme/       design tokens (JS + CSS) and the dark / light MUI themes
 *   components/  buttons, inputs, cards, dialogs, calendar, charts, portal shell
 *   hooks/       data loading, countdowns, toasts, page titles
 *   auth/        session provider factory and route guard
 *   services/    the data layer (swap for API calls when the backend lands)
 *   utils/       formatting, status pipeline, validation
 */
export { tokens, eyebrowSx, shakeSx } from './theme/tokens.js';
export { darkTheme, lightTheme } from './theme/createTheme.js';

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

export { BUSINESS, RULES, OCCASIONS, SETUP_STYLES, setupsFor, BLOCK_REASONS, INVENTORY_CATEGORIES, OUTSOURCE_SERVICES, FEEDBACK_CATEGORIES } from './services/config.js';
export { computeQuote, extraGuests } from './services/pricing.js';
export { ApiError } from './services/store.js';
export * as authApi from './services/authService.js';
export * as catalogApi from './services/catalogService.js';
export * as calendarApi from './services/calendarService.js';
export * as reservationApi from './services/reservationService.js';
export * as paymentApi from './services/paymentService.js';
export * as messageApi from './services/messageService.js';
export * as customerApi from './services/customerService.js';
export * as feedbackApi from './services/feedbackService.js';
export * as reportApi from './services/reportService.js';
export * as inventoryApi from './services/inventoryService.js';
export * as outsourceApi from './services/outsourceService.js';
