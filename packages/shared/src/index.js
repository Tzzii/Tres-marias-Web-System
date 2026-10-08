/**
 * @tm/shared: everything both portals reuse.
 *
 *   theme/       design tokens (JS + CSS), the dark / light colour schemes and the MUI themes
 *   components/  buttons, inputs, cards, dialogs, calendar, charts, portal shell
 *   hooks/       data loading, countdowns, toasts, page titles
 *   auth/        session provider factory and route guard
 *   services/    the data layer: each xxxApi is services/remote/xxx.js, one function per API call
 *                (services/http.js); every page's data comes from the API (the browser data store
 *                was removed in Phase 12)
 *   utils/       formatting, status pipeline, validation, saving part of a page as a PDF
 */
export { tokens, eyebrowSx, shakeSx } from './theme/tokens.js';
export { darkPalette, lightPalette } from './theme/palettes.js';
export { darkTheme, lightTheme, warmTheme, themeForMode, surfaceThemeForMode } from './theme/createTheme.js';
export { ColorModeProvider, useColorMode, applyColorMode, readColorMode } from './theme/colorMode.jsx';
export { ThemeModeToggle } from './components/ThemeModeToggle.jsx';

export { LightSurface, DarkSurface } from './components/Surface.jsx';
export { DashCard, CardTitle, StatCard, DetailRow, Field } from './components/DashCard.jsx';
export { Pill, StatusChip, PaymentStatusChip, QrStatusChip, BalanceChip, FeedbackStatusChip } from './components/Pill.jsx';
export { StatusPipeline } from './components/StatusPipeline.jsx';
export { FieldLabel, FormField, SelectField, PasswordField, MobileField } from './components/FormField.jsx';
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
export { EndTimeField, TimeField } from './components/TimeField.jsx';
export { BarChart, RankBars } from './components/BarChart.jsx';
export { DataTable, Pager } from './components/DataTable.jsx';
export { DocumentDialog, documentsFor } from './components/DocumentDialog.jsx';
export { ScrollToTop, NotFoundPage } from './components/Routing.jsx';
export { ChatPanel } from './components/ChatPanel.jsx';
export { default as PortalShell } from './components/PortalShell.jsx';

export { useResource, useStoreVersion } from './hooks/useResource.js';
export { useCountdown, formatCountdown } from './hooks/useCountdown.js';
export { useQrWatch } from './hooks/useQrWatch.js';
export { useDocumentTitle } from './hooks/useDocumentTitle.js';
export { NotifyProvider, useNotify } from './hooks/useNotify.jsx';

export { createAuth, safeNextPath } from './auth/createAuth.jsx';

export * from './utils/format.js';
export * from './utils/status.js';
export * from './utils/validation.js';
// The Save PDF buttons: draws an element onto A4 pages and saves the file (loads its libraries on first use)
export { saveElementAsPdf } from './utils/savePdf.js';
// Saving a file with the computer's "Save as" window where the browser allows it (TXT exports, Save PDF)
export { askWhereToSave, canAskWhereToSave, saveFile, writeTo } from './utils/saveFile.js';

export { BUSINESS, RULES, OCCASIONS, SERVICE_TYPES, includesFood, RENTAL_SERVICE, isRental, RENTAL, RENTAL_FULFILMENT, DISH_CATEGORIES, BUFFET_DRINKS, MENU_LINE_MAX, DEFAULT_PRICE_PER_PLATE, PRICE_PER_PLATE_RANGE, DEFAULT_MIN_DOWNPAYMENT, MIN_DOWNPAYMENT_RANGE, ADDON_PRICE_RANGE, BLOCK_REASONS, BLOCK_NOTE_MAX, INVENTORY_CATEGORIES, OUTSOURCE_SERVICES, FEEDBACK_CATEGORIES } from './services/config.js';
export { computeQuote, isRentalPackage } from './services/pricing.js';
// Event times (an end time 2 to 6 hours after the start, maybe past midnight) and a blocked date's note for customers
export { blockNote, endTimeOptions, endTimeProblem, endsNextDay, eventHours, shiftEndTime } from './domain/availability.js';
// The Terms of Service and Privacy Policy (pages, sign-up, booking form) and the version customers agree to
export { TERMS_UPDATED, TERMS_VERSION, privacyPolicy, termsOfService } from './legal/terms.js';
// Where a pending request stands: the admin owes a quotation or a revised one, or the customer can accept it
export { pendingStep } from './domain/reservation.js';
// The downpayment due date an approval sets (the customer's Accept Quotation dialog shows it before accepting)
export { downpaymentDueFor } from './domain/money.js';
// When a customer may cancel online (pages read the answer from each reservation's summary; the window in words is for texts)
export { cancelDeadline, onlineCancellation, cancelWindowText } from './domain/cancellation.js';
// The reference-number rule of the payment and refund forms, the same one the services check, and where a QR Ph code stands (waiting, checking, paid …)
export { qrState, referenceProblem } from './domain/payment.js';
// An additional charge's own price, its sizes and its packages (the admin's form and the booking form use the same rules as the services)
export { MAX_ADDON_SIZES, PACKAGE_INCLUDES_MAX, addonPriceMap, flattenAddons, readAddonPrice, readAddonSizes } from './domain/catalog.js';
export { ApiError } from './services/errors.js';
export * as authApi from './services/remote/auth.js';
export * as catalogApi from './services/remote/catalog.js';
export * as calendarApi from './services/remote/calendar.js';
export * as reservationApi from './services/remote/reservation.js';
export * as paymentApi from './services/remote/payment.js';
export * as messageApi from './services/remote/message.js';
export * as customerApi from './services/remote/customer.js';
export * as feedbackApi from './services/remote/feedback.js';
export * as reportApi from './services/remote/report.js';
export * as inventoryApi from './services/remote/inventory.js';
export * as outsourceApi from './services/remote/outsource.js';
