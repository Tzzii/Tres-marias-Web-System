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
│   ├── admin/                       # ADMIN DASHBOARD (deploys on its own)
│   │   ├── index.html
│   │   ├── vite.config.js
│   │   └── src/
│   │       ├── main.jsx, App.jsx    # Routes: /login, /dashboard, /reservations(/:ref), /reports, ...
│   │       ├── auth.js              # Admin session (own storage key)
│   │       ├── layouts/AdminLayout.jsx
│   │       ├── components/SectionTabs.jsx  # Tabs that switch sections inside one page
│   │       ├── components/MessagesWidget.jsx  # Top-bar chat window (small / full screen)
│   │       ├── lib/txt.js           # Plain-text (.txt) exports
│   │       └── pages/               # 1q Login, 1r Dashboard, Reservation & Calendar, 1t Reservation detail,
│   │           │                    # 1u Packages, Inventory, 1x Customers, 1y Reports, Outsourcing,
│   │           │                    # Feedbacks, My account
│   │           ├── reservations/    # Tabs of Reservation & Calendar: 1s Requests, All reservations, 1v Calendar
│   │           └── reports/         # Tab of Reports: 1w Payments and balances
│   └── api/                         # API (Express 5 + MySQL 8), port 4000
│       ├── schema.sql               # Every table (npm run db:reset)
│       ├── http/                    # Saved requests per module (VS Code REST Client)
│       └── src/                     # server.js, app.js, config.js, db.js, seed.js, lib/, middleware/,
│                                    # integrations/ (mail, SMS, storage), modules/ (auth so far)
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
│           ├── domain/              # Pure rules the API imports too (account, outsource)
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
npm run dev          # API + Customer Portal + Admin Dashboard together
```

`npm run dev` starts the API on http://localhost:4000 (check http://localhost:4000/api/health),
the Customer Portal on http://localhost:5173 and the Admin Dashboard on http://localhost:5174.
Each can also run alone: `npm run dev:api`, `npm run dev:client`, `npm run dev:admin`.

**The API is needed to sign in.** Since backend Phase 3, sign-in, sign-up, password reset and
the account pages run on the API, and since Phase 4 so does the catalogue (packages, additional
charges, buffet dishes, the buffet price per person and the rental price list):
`VITE_API_SERVICES=auth,catalog` in each portal's `.env.local`. The other pages still use the
browser store until their phase. The API needs MySQL 8. First time only:

1. Copy `apps/api/.env.example` to `apps/api/.env` and set `DB_PASSWORD` and a long random `JWT_SECRET`.
2. As the MySQL root user, run `apps/api/db-setup.sql` once (creates the `tres_marias` database and user).
3. `npm run db:reset` (creates the tables), then `npm run seed:api` (loads the sample data below).

Each portal reads `VITE_API_URL` and `VITE_API_SERVICES` from its own `.env.local` (copy its
`.env.example`). The full backend plan is in `docs/backend-development-phases.md`.

Build and preview production bundles:

```bash
npm run build            # builds apps/client/dist and apps/admin/dist
npm run preview:client   # http://localhost:4173
npm run preview:admin    # http://localhost:4174
```

### Trying the site on a phone

The phone and the computer must be on the same Wi-Fi. Stop `npm run dev:client` first (both use port 5173), then:

```bash
npm run dev:client:phone   # same as dev:client, but other devices on the Wi-Fi can open it
```

Vite prints a `Network:` address such as `http://192.168.x.x:5173/`; open that on the phone.
If the phone cannot connect, allow Node.js through Windows Firewall for the network type the
Wi-Fi uses (Private or Public). The admin site works the same way: `npm run dev:admin -- --host`.

Keep the API running too (`npm run dev:api`). On these `--host` runs the portal sends its API
calls to the dev server's `/api` path, which passes them on to the API on the computer
(`scripts/vite-run.mjs`, `vite.config.js`), because `localhost` on the phone would be the phone.

Pages not yet on the API keep their records in each browser (see below), so the phone starts with
its own copy of that sample data: a reservation made on the phone does not appear in the admin
site on the computer until reservations move to the API (backend Phase 8).

### A note on the folder name

Rollup (inside Vite) treats everything after `#` in a path as a URL fragment, so Vite fails
in a folder named `capstone website #2`. `scripts/vite-run.mjs` runs Vite through a
directory junction without `#`. **Renaming the folder (for example to `capstone-website-2`)
is the clean fix**; the script detects a clean path and runs Vite directly, no other change needed.

---

## Development accounts

These accounts are in the sample data (in the database after `npm run seed:api`, and in the
browser store):

| App | Username | Password | Second step |
| --- | --- | --- | --- |
| Customer Portal | `maria.santos@gmail.com` (or any seeded customer) | `Celebrate2026` | — |
| Admin Dashboard | `emmamariaobet@gmail.com` | `TresMarias@2026` | 6-digit code sent by email |

New customer accounts can also be created from **Sign up**.

**Sign-in and password-reset codes.** There is no fixed code: every request gets a new random
6-digit code. The admin's sign-in code (and the code that confirms a new email or mobile number)
is emailed to the admin; the customer's password-reset code (Forgot password on the Log in page)
is texted to the mobile number on the account. In development `apps/api/.env` has
`MAIL_DRIVER=log` and `SMS_DRIVER=log`, so nothing is really sent: each message is printed in the
API's terminal and saved in the `outbox` table. For real email, set `MAIL_DRIVER=smtp` and the
`SMTP_*` settings (for example a Gmail App Password, or Mailtrap for a test inbox). If `auth` is
removed from `VITE_API_SERVICES`, the browser store prints the code in the browser's developer
console (F12 → Console) instead.

**Lockouts.** 5 wrong passwords lock an account for 5 minutes, and 5 wrong codes pause code entry
for 2 minutes. The API keeps these in the database, so clearing the browser's data does not lift
them; `npm run seed:api` does (it reloads the sample data).

**Resetting the data:** `npm run seed:api` puts the database back to the sample data. When
`apps/api/schema.sql` has changed (e.g. Phase 4 gave packages, additional charges and dishes a
`sort_order` column), run `npm run db:reset` first, then `npm run seed:api`. Pages that
still use the browser store keep their records in each site's `localStorage` under `tm.data.v15`:
clear site data in the browser (DevTools → Application → Storage → Clear site data) to start over.
Sample event dates are placed relative to the day the data is created, so reset both on the same
day to keep the reservation references matching; after a few days "events today" drifts.

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
