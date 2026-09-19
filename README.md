# Tres Marias Catering Services — Customer Portal & Admin Dashboard

Front-end phase. Two React apps that are deployed separately but share one design
system, one component library and one service layer (which becomes the shared backend
in the next phase).

| App | Who uses it | Dev URL | Source |
| --- | --- | --- | --- |
| **Customer Portal** | Guests and customers | http://localhost:5173 | `apps/client` |
| **Admin Dashboard** | Tres Marias admin | http://localhost:5174 | `apps/admin` |

Stack: React 18 · Vite 5 · MUI 6 (components) · modular CSS tokens · JavaScript (ES2020+) · React Router 6.

---

## Project structure

```text
capstone website #2/
├── apps/
│   ├── client/                      # CUSTOMER PORTAL (deploys on its own)
│   │   ├── index.html
│   │   ├── vite.config.js
│   │   └── src/
│   │       ├── main.jsx, App.jsx    # Routes: /, /packages/:slug, /login, /signup, /portal/*
│   │       ├── auth.js              # Customer session (own storage key)
│   │       ├── layouts/             # PortalLayout: sidebar, bottom tabs, notifications
│   │       ├── components/          # SiteNav, SiteFooter, BookingBar, AuthGate, AuthLayout, ...
│   │       ├── lib/booking.js       # Booking picked while browsing + form drafts
│   │       └── pages/
│   │           ├── public/          # 1a Home, 1b Package detail (1c gate), 1d Sign up, 1e Log in
│   │           └── portal/          # 1g Dashboard, 1h/1i Reservations, 1f Book, 1j Calendar,
│   │                                # 1k Payments, Documents, 1l Chat, Packages, Testimonials, Profile
│   └── admin/                       # ADMIN DASHBOARD (deploys on its own)
│       ├── index.html
│       ├── vite.config.js
│       └── src/
│           ├── main.jsx, App.jsx    # Routes: /login, /dashboard, /reservations(/:ref), /reports, ...
│           ├── auth.js              # Admin session (own storage key)
│           ├── layouts/AdminLayout.jsx
│           ├── components/SectionTabs.jsx  # Tabs that switch sections inside one page
│           ├── components/MessagesWidget.jsx  # Top-bar chat window (small / full screen)
│           ├── lib/txt.js           # Plain-text (.txt) exports
│           └── pages/               # 1q Login, 1r Dashboard, Reservation & Calendar, 1t Reservation detail,
│               │                    # 1u Packages, Inventory, 1x Customers, 1y Reports, Outsourcing,
│               │                    # Feedbacks, My account
│               ├── reservations/    # Tabs of Reservation & Calendar: 1s Requests, All reservations, 1v Calendar
│               └── reports/         # Tab of Reports: 1w Payments and balances
├── packages/
│   └── shared/                      # SHARED BY BOTH APPS (imported as @tm/shared)
│       ├── public/images/           # Logo and event theme icons (served by both apps)
│       └── src/
│           ├── theme/               # Design tokens (JS + CSS variables), dark + light MUI themes
│           ├── components/          # PortalShell, DashCard, StatCard, FormField, OtpInput, AppDialog,
│           │                        # ConfirmDialog, MonthCalendar, DateField, DataTable, BarChart,
│           │                        # StatusPipeline, ChatPanel, DocumentDialog, ...
│           ├── hooks/               # useResource, useCountdown, useNotify, useDocumentTitle
│           ├── auth/createAuth.jsx  # Session provider, idle timeout, route guard
│           ├── services/            # The data layer both apps call (see "Connecting the backend")
│           └── utils/               # Formatting, status pipeline, validation
├── scripts/vite-run.mjs             # Runs Vite (handles the "#" in the folder name)
└── package.json                     # npm workspaces + scripts
```

Why a monorepo instead of one app with `/admin` routes: the two sites deploy to different
hosts, so the customer site never ships the admin screens and each app can be released on
its own schedule, while both still import the same `@tm/shared` package. (In this front-end
phase the shared service layer, including admin actions and seed records, is still bundled
into both apps; it is replaced by API calls in the backend phase.)

---

## Getting started

```bash
npm install          # once, from the project root
npm run dev:client   # Customer Portal  → http://localhost:5173
npm run dev:admin    # Admin Dashboard  → http://localhost:5174
```

Build and preview production bundles:

```bash
npm run build            # builds apps/client/dist and apps/admin/dist
npm run preview:client   # http://localhost:4173
npm run preview:admin    # http://localhost:4174
```

### A note on the folder name

Rollup (inside Vite) treats everything after `#` in a path as a URL fragment, so Vite fails
in a folder named `capstone website #2`. `scripts/vite-run.mjs` runs Vite through a
directory junction without `#`. **Renaming the folder (for example to `capstone-website-2`)
is the clean fix**; the script detects a clean path and runs Vite directly, no other change needed.

---

## Development accounts

The front-end phase keeps records in the browser (see below). These accounts are seeded:

| App | Username | Password | Second step |
| --- | --- | --- | --- |
| Customer Portal | `maria.santos@gmail.com` (or any seeded customer) | `Celebrate2026` | — |
| Admin Dashboard | `emmamariaobet@gmail.com` | `TresMarias@2026` | Admin verification code `482913` |

Until email sending is connected, the admin code comes from `VITE_ADMIN_VERIFICATION_CODE`
(default `482913`). New customer accounts can also be created from **Sign up**.

**Customer password reset code:** Forgot password on the customer Log in page texts a code to the
mobile number on the account. Until SMS sending is connected, the code comes from
`VITE_CUSTOMER_RESET_CODE` (default `615204`).

**Resetting the data:** the records live in each site's `localStorage` under `tm.data.v11`.
Clear site data in the browser (DevTools → Application → Storage → Clear site data) to start
over from the seed. Seed event dates are placed relative to the day the data is first created,
so after a few days "events today" drifts; clearing site data re-seeds around the current date.

---

## How the front-end phase works

- **Service layer.** Every page calls functions in `packages/shared/src/services/*`
  (`reservationApi.approveReservation(ref)`, `paymentApi.verifyPayment(id)`, …). They are
  async, return plain JSON, throw `ApiError { code, message, meta }`, and simulate network
  latency, exactly like API calls.
- **Storage.** In this phase the services persist to `localStorage`. Because the two apps
  run on different origins, **each app has its own copy of the data** in development: a
  reservation submitted in the Customer Portal does not appear in the Admin Dashboard
  until the shared backend is connected. Each side can be exercised end to end on its own.
- **Status pipeline.** Pending → Approved → Downpayment paid → Confirmed → Completed, plus
  Declined (admin) and Cancelled (customer). Rules are enforced in the services, not the UI.
- **Feedback.** Once an event is completed the customer rates it in the portal (overall stars,
  a rating for each part of the service and a short review). The same record is what the admin
  opens under **Feedbacks**: they publish it on the website, feature it on the homepage, flag it
  with a reason, archive it, or reply — and the reply is saved under the review *and* sent to the
  customer as a message. Nothing reaches the public site until the admin publishes it.

## Connecting the backend (next phase)

The full, step-by-step plan — phases, endpoint map, schema, security tests and a resume
checklist for picking the work up again — is in
[docs/backend-development-phases.md](docs/backend-development-phases.md). In short:

1. Build the Express API with endpoints that mirror the service functions.
2. Replace each service function body with a `fetch` to its endpoint; keep the same
   function names, arguments, return shapes and `ApiError` codes.
3. Delete `services/store.js` and `services/seed.js`.
4. Move the rules in `services/config.js` (lead time, lockouts, capacity) server-side.

No page or component needs to change.

## Deploying the two sites

Each app builds to static files (`apps/client/dist`, `apps/admin/dist`). Host them on
separate domains (for example `tresmarias.ph` and `admin.tresmarias.ph`) with an SPA
fallback so deep links load `index.html`:

```nginx
server {
    server_name tresmarias.ph;
    root /var/www/client/dist;
    location / { try_files $uri /index.html; }
}
server {
    server_name admin.tresmarias.ph;
    root /var/www/admin/dist;
    location / { try_files $uri /index.html; }
}
```

Both will call the same API once it exists.
