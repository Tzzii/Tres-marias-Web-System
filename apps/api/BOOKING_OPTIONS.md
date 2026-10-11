Reservation options

- Menu categories accept arrays of individual dish names, with at most two in each category and exactly four total. Existing text menus remain readable and editable as one choice per category.
- The existing menu JSON also stores `juice` and `dessert: { name, description }`. Desserts are booked through `add-dessert` and quoted as an ordinary additional charge; they are excluded from the four-dish count and buffet rate. Catering-only bookings can include dessert without buffet dishes.
- Both form and API use domain/menu.js validation. Customer/admin details and generated documents display the saved preferences.
- Themes suggest two color schemes. ROYGBIV family buttons expose shade choices; metallics remain available. Saved custom motif colors remain readable.
- Additional charge cards expand independently.

Before starting an updated API against an existing database, run `npm run catalog:update` (or `npm run catalog:update -- --live` for an explicitly authorized remote deployment). This idempotent catalog change adds the separately quoted Dessert charge and moves Kare-Kare to Pork, preserving dish IDs, booked menus and configured prices. It does not reset the database. Fresh seeds include these changes.

Verification: `npm run test:booking`, `npm run test:booking:db` against local MySQL, and `npm run build`. Database tests run the booking service in a transaction and roll back all fixtures, including chat and outbox records.
