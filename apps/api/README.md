# Tres Marias API

The API uses Express and MySQL. Start it from the project root with `npm run dev:api`.

## Folder layout

- `src/`: runtime code and database seed data.
- `scripts/`: database setup, migration, seeding, route audits and email previews.
- `tests/`: automated checks; shared test helpers are in `tests/helpers/`.
- `uploads/`: files used by the application; preserve these together with the database.
- `tmp/`: generated previews and local seed backups; created by tools when needed.

## Verification

Run `npm test` from the project root to check API behavior, admin form logic and customer features. The default API suite uses fixtures or mocked database/storage access; it does not write to the configured MySQL database. Individual `test:*` commands remain available. Database integration checks and `test:security` are separate, explicit commands.

## Automatic equipment rental checkout

Approved rentals already hold their requested quantities on their rental date. The existing booking
availability checks release those holds when cancelled and move them with a rescheduled date.
Inventory Available continues to mean physical stock: Total minus In use minus Damaged.

The API checks once per minute and at startup for **today's confirmed equipment rentals** whose
pickup/delivery time has arrived, using Asia/Manila time. It checks out the never-dispatched pieces
in one transaction. No browser needs to be open. Earlier historical dates are deliberately excluded
when deploying this feature. Manual **Check out now** remains available for early dispatch.

The availability lock, reservation lock and item locks serialize checkout with cancellation,
rescheduling, returns, stock changes and another API process. The `rental_dispatches` ledger records
lifetime quantities separately from current allocations. Returning pieces never erases this ledger.
The old inventory audit history supplies the baseline for rentals checked out before deployment.
Repeated ticks and server restarts cannot check out those returned pieces again.

If any item is short, archived or missing, nothing is partially checked out. The rental audit trail
records the problem once per distinct failure, and the next minute retries. Successful movements
are signed **Automatic inventory** in the item history and reservation audit trail. Committed changes
publish through the existing realtime/change-stamp mechanism.

Returns still require the actual good/damaged quantities. Catering package items do not have a
matching inventory allocation list, so this scheduler applies to equipment rentals. Partner
outsourcing requests remain separate from owned inventory.

Deployment: run `npm run db:migrate` before restarting the API. This adds `rental_dispatches` while
preserving existing data. Do not reset the database. Validate with `npm run test:inventory`,
`npm run test:inventory:db` (local MySQL only; fixtures roll back, except one UUID-scoped concurrency
fixture that is committed then removed in a finally block), and `npm run build`.

## Reservation options

- Menu categories accept arrays of individual dish names, with at most two in each category and exactly four total. Existing text menus remain readable and editable as one choice per category.
- The existing menu JSON also stores `juice` and `dessert: { name, description }`. Desserts are booked through `add-dessert` and quoted as an ordinary additional charge; they are excluded from the four-dish count and buffet rate. Catering-only bookings can include dessert without buffet dishes.
- Both form and API use domain/menu.js validation. Customer/admin details and generated documents display the saved preferences.
- Themes suggest two color schemes. ROYGBIV family buttons expose shade choices; metallics remain available. Saved custom motif colors remain readable.
- Additional charge cards expand independently.

Before starting an updated API against an existing database, run `npm run catalog:update` (or `npm run catalog:update -- --live` for an explicitly authorized remote deployment). This idempotent catalog change adds the separately quoted Dessert charge and moves Kare-Kare to Pork, preserving dish IDs, booked menus and configured prices. It does not reset the database. Fresh seeds include these changes.

Verification: `npm run test:booking`, `npm run test:booking:db` against local MySQL, and `npm run build`. Database tests run the booking service in a transaction and roll back all fixtures, including chat and outbox records.
