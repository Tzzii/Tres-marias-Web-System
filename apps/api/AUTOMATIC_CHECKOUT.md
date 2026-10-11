# Automatic equipment rental checkout

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
