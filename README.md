# Tres Marias Catering Services — Customer Portal, Admin Dashboard & API

Two React apps that are deployed separately, and the Express + MySQL API they both call. The apps
share one design system, one component library and one service layer (`@tm/shared`); the API shares
the same business rules (`packages/shared/src/domain`), so a page and the server always agree.

| App | Who uses it | Dev URL | Source |
| --- | --- | --- | --- |
| **Customer Portal** | Guests and customers | http://localhost:5173 | `apps/client` |
| **Admin Dashboard** | Tres Marias admin | http://localhost:5174 | `apps/admin` |
| **API** | Both portals (never a person) | http://localhost:4000/api | `apps/api` |

Stack: React 18 · Vite 5 · MUI 6 (components) · React Router 6 · modular CSS tokens · JavaScript (ES2020+) ·
Express 5 · MySQL 8 · JWT sessions · bcrypt · zod.

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
│   │       ├── assets/              # Package illustrations; gallery/ = event photos (see its README)
│   │       ├── components/          # SiteNav, SiteFooter, BookingBar, GalleryDialog, AuthGate,
│   │       │                        # EmailCode (the emailed-code step), PasswordResetDialog, ...
│   │       ├── lib/booking.js       # Booking picked while browsing + form drafts
│   │       ├── lib/gallery.js       # Gallery boxes and photos, read from assets/gallery
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
│   │       ├── components/          # SectionTabs (tabs inside one page), RefundDialog
│   │       ├── lib/txt.js           # Plain-text (.txt) exports
│   │       └── pages/               # 1q Login, 1r Dashboard, Reservation & Calendar, 1t Reservation detail,
│   │           │                    # 1u Packages, Inventory, 1x Customers, Messages, 1y Reports,
│   │           │                    # Outsourcing, Feedbacks, My account
│   │           ├── reservations/    # Tabs of Reservation & Calendar: 1s Requests, All reservations, 1v Calendar
│   │           └── reports/         # Tab of Reports: 1w Payments and balances
│   └── api/                         # API (Express 5 + MySQL 8), port 4000
│       ├── schema.sql               # Every table (npm run db:reset; npm run db:migrate adds new ones)
│       ├── http/                    # Saved requests per module (VS Code REST Client)
│       ├── scripts/                 # db-reset, db-migrate, db-ping, db-roundtrip, and the security
│       │                            # checks: route-audit.js, security-tests.js (lib/ = their helpers)
│       └── src/                     # server.js, app.js, config.js, db.js, seed.js, lib/, middleware/,
│                                    # integrations/ (mail, SMS, storage, PayMongo), modules/ (one per service),
│                                    # seedData/ (the sample data the seeder loads)
├── packages/
│   └── shared/                      # SHARED BY BOTH APPS (imported as @tm/shared)
│       ├── public/images/           # Logo and event theme icons (served by both apps)
│       └── src/
│           ├── theme/               # Design tokens (JS + CSS variables), dark + light MUI themes
│           ├── components/          # PortalShell, DashCard, StatCard, FormField, OtpInput, AppDialog,
│           │                        # ConfirmDialog, MonthCalendar, DateField, DataTable, BarChart,
│           │                        # StatusPipeline, ChatPanel, DocumentDialog, ...
│           ├── hooks/               # useResource, useCountdown, useNotify, useDocumentTitle
│           ├── auth/createAuth.jsx  # Session provider, idle timeout, route guard, change polling
│           ├── domain/              # Pure rules the API imports too (money, reservation, inventory, outsource, …)
│           ├── services/            # The data layer: remote/* (one function per API call), http.js,
│           │                        # poller.js, events.js, config.js (business rules and settings)
│           └── utils/               # Formatting, status pipeline, validation
├── scripts/vite-run.mjs             # Runs Vite (handles the "#" in the folder name)
└── package.json                     # npm workspaces + scripts
```

Why a monorepo instead of one app with `/admin` routes: the two sites deploy to different
hosts, so the customer site never ships the admin screens and each app can be released on
its own schedule, while both still import the same `@tm/shared` package. The website bundles hold
no data of their own: every page asks the API, and the sample data lives only in the API's seeder
(`apps/api/src/seedData`), so no password or sample customer is ever shipped to a browser.

---

## Getting started

```bash
npm install          # once, from the project root
npm run dev          # API + Customer Portal + Admin Dashboard together
```

`npm run dev` starts the API on http://localhost:4000 (check http://localhost:4000/api/health),
the Customer Portal on http://localhost:5173 and the Admin Dashboard on http://localhost:5174.
Each can also run alone: `npm run dev:api`, `npm run dev:client`, `npm run dev:admin`.

**The API is needed for every page.** Sign-in, sign-up, the catalogue, the calendar, reservations,
chat, payments, customers, reviews, inventory, outsourcing, the Dashboard and Reports all come from the
API (the TXT exports are made in the browser from what it sends). While signed in, each portal asks the
API every 15 seconds (only while the tab is visible) whether anything changed, and reloads what it
shows, so one portal's changes show in the other without a refresh. Sending an outsourcing request (it
only asks a partner if they can supply the items for an event; it is not a contract) goes through the
mail and SMS ports: with `MAIL_DRIVER=log` and `SMS_DRIVER=log` nothing leaves the server, and the
Outsourcing page says so, so the admin downloads the request (.txt) and sends it themselves.

**Payments.** Customers pay three ways: **GCash / e-wallet by QR only** (PayMongo QR Ph, confirmed
automatically), **bank transfer** (the reference number and a photo of the receipt, which the admin
verifies under Reports → Payments) or **cash on site** (recorded by the admin). Uploaded receipts are
kept in `apps/api/uploads/proofs` (git-ignored), never in a public folder. The GCash option stays
greyed out until `apps/api/.env` has both `PAYMONGO_SECRET_KEY` (a `sk_test_…` key while developing;
the `sk_live_…` key goes on the live server only) and `PAYMONGO_WEBHOOK_SECRET` (the `whsk_…`
secret of the webhook created in the PayMongo dashboard, pointing at `/api/webhooks/paymongo`
through a tunnel such as `cloudflared tunnel --url http://localhost:4000` while developing). In test
mode the API prints each QR's test link (`[PAYMONGO TEST] …`) for simulating the payment; never scan
and pay a test QR.

The API needs MySQL 8. First time only:

1. Copy `apps/api/.env.example` to `apps/api/.env` and set `DB_PASSWORD`, a long random `JWT_SECRET`,
   and the passwords the seeder gives the accounts it creates: `SEED_ADMIN_PASSWORD` (the admin) and
   `SEED_CUSTOMER_PASSWORD` (every sample customer). They are never written in the code or here.
2. As the MySQL root user, run `apps/api/db-setup.sql` once (creates the `tres_marias` database and user).
3. `npm run db:reset` (creates the tables), then `npm run seed:api` (loads the sample data below)
   or `npm run seed:starter` (the fresh start with no customers, see "Resetting the data").

When an update adds a table (Phase 12 added `signup_requests` and `password_changes`), a database that
already holds data gets it with `npm run db:migrate`: it creates the tables `schema.sql` has and the
database lacks, and changes nothing else.

Each portal reads `VITE_API_URL` (where the API is) from its own `.env.local` (copy its `.env.example`).
The full backend plan is in `docs/backend-development-phases.md`.

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

### A note on the folder name

Rollup (inside Vite) treats everything after `#` in a path as a URL fragment, so Vite fails
in a folder named `capstone website #2`. `scripts/vite-run.mjs` runs Vite through a
directory junction without `#`. **Renaming the folder (for example to `capstone-website-2`)
is the clean fix**; the script detects a clean path and runs Vite directly, no other change needed.

---

## Development accounts

These accounts are in the sample data (in the database after `npm run seed:api`). After
`npm run seed:starter` only the admin account is there. Their passwords are the ones in your own
`apps/api/.env` (this repository is public, so they are not written here):

| App | Username | Password | Second step |
| --- | --- | --- | --- |
| Customer Portal | `maria.santos@gmail.com` (or any seeded customer) | `SEED_CUSTOMER_PASSWORD` | — |
| Admin Dashboard | `emmamariaobet@gmail.com` | `SEED_ADMIN_PASSWORD` | 6-digit code sent by email |

New customer accounts are created from **Sign up**: the form, then the 6-digit code emailed to the
address typed (the account is made only when that code is entered).

**One-time codes.** Every code goes by **email, never by SMS**: the admin's sign-in code and the code
that confirms a new email or mobile number, and the customer's codes for signing up, for a forgotten
password (Forgot password on the Log in page, or "Forgot your current password?" in My profile) and for
a password change in My profile (the current password and the emailed code). There is no fixed code:
every request gets a new random one. In development `apps/api/.env` has `MAIL_DRIVER=log`, so nothing is
really sent: each message is printed in the API's terminal and saved in the `outbox` table. For real
email, set `MAIL_DRIVER=smtp` and the `SMTP_*` settings (for example a Gmail App Password, or Mailtrap
for a test inbox). SMS is for notifications and outsourcing requests only.

**Lockouts.** 5 wrong passwords lock an account for 5 minutes, and 5 wrong codes pause code entry
for 2 minutes. At most 5 code emails an hour go to one customer address. The API keeps these in the
database, so clearing the browser's data does not lift them; `npm run seed:api` does (it reloads the
sample data), and so does a finished password reset for that account.

**Resetting the data:** `npm run seed:api` puts the database back to the sample data. When
`apps/api/schema.sql` has changed (e.g. Phase 4 gave packages, additional charges and dishes a
`sort_order` column), run `npm run db:reset` first, then `npm run seed:api`. Sample event dates are
placed relative to the day the data is created, so after a few days "events today" drifts: run
`npm run seed:api` again.

**Fresh start (go-live):** `npm run seed:starter` loads only the real business data: the admin
account, the packages, additional charges, dishes and settings, and the 48 inventory items with
every piece available (none in use, none damaged). There are no customers, reservations, payments,
chat, reviews, blocked dates or outsourcing partners, so the website starts like a new one and the
first customer to sign up starts the records. The first receipt is OR-1001. On the live server
(`NODE_ENV=production`) run it once from `apps/api` as `npm run seed:starter -- --force`; running it
again later would erase every real customer. The admin's first password is `SEED_ADMIN_PASSWORD` from
the server's own `.env`: choose a new, strong one there.

---

## How the system works

- **Service layer.** Every page calls the functions of `@tm/shared` (`reservationApi.approveReservation(ref)`,
  `paymentApi.verifyPayment(id)`, …), which are `packages/shared/src/services/remote/*`: one API call
  each through `services/http.js`, with the session token. They return plain JSON and throw
  `ApiError { code, message, meta }`, so every page handles an error the same way.
- **Data.** Everything is in MySQL, behind the API. A browser keeps only the session (sessionStorage, or
  localStorage with "Remember me") and UI preferences: booking drafts, table columns, read
  notifications, the collapsed sidebar, the colour mode.
- **Rules.** The server is the authority: every rule a page checks is checked again by the API, with
  the same code where it is pure (`packages/shared/src/domain`) and the same messages.
- **Status pipeline.** Pending → Approved → Downpayment paid → Confirmed → Completed, plus
  Declined (admin) and Cancelled (by the customer online, or by the admin with a reason). The
  customer pays at least the minimum downpayment first (a setting on the admin Payments tab), and
  money owed back after a cancellation or a lower revised quotation is recorded as a refund.
- **Feedback.** Once an event is completed the customer rates it in the portal (overall stars,
  a rating for each part of the service and a short review). The same record is what the admin
  opens under **Feedbacks**: they publish it on the website, feature it on the homepage, flag it
  with a reason, archive it, or reply — and the reply is saved under the review *and* sent to the
  customer as a message. Nothing reaches the public site until the admin publishes it.

## Security checks

Two scripts check the API the way the panel would (Phase 12). Each starts its own API process on
the database in `apps/api/.env`, so nothing else needs to be running:

```bash
npm run audit:routes -- --writes-test-data    # every route with no token, a customer's and the admin's -> docs/route-audit.md
npm run test:security -- --writes-test-data   # the 19 security tests (+ checks of the email codes) -> docs/security-tests.md
```

They add test customers, bookings and payments (addresses `@example.test`), which is why they ask for
`--writes-test-data`: run them on a database you will reset afterwards (locally, back up first or run
`npm run seed:api` after; on the live server, before `npm run seed:starter`). `npm run audit:routes`
can also check a running API: `-- --base https://api.example.ph/api --writes-test-data`, run on the
server itself (its tokens are signed with that server's `JWT_SECRET`).

With `NODE_ENV=production` the API refuses to start with development settings: `MAIL_DRIVER` must be
`smtp` with the business's own `MAIL_FROM`, `SMS_DRIVER` must be a real provider (or `ALLOW_SMS_LOG=true`
while none is connected), `CORS_ORIGINS` must list the live portals (no localhost), `JWT_SECRET` must be
32+ random characters and `DB_PASSWORD` must be set.

## Deploying the two sites

Each app builds to static files (`apps/client/dist`, `apps/admin/dist`), with `VITE_API_URL` set to
the live API at build time. Host them on separate domains (for example `tresmarias.ph` and
`admin.tresmarias.ph`) with an SPA fallback so deep links load `index.html`:

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

Both call the same API (for example `api.tresmarias.ph`, proxied to port 4000). The full deployment
checklist (HTTPS, firewall, the production `.env`, the fresh start, backups) is Phase 13 of
`docs/backend-development-phases.md`.
