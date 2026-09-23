-- Tres Marias database schema: every table the API uses, in one file.
--
-- DEVELOPMENT ONLY: this DROPS EVERY TABLE and creates them again, empty. All data is lost.
-- Run it with `npm run db:reset` (scripts/db-reset.js), which refuses to run in production
-- without --force. It runs inside the database named by DB_NAME in apps/api/.env, so there is
-- no CREATE DATABASE / USE here (apps/api/db-setup.sql creates the database and its user).
-- Load the sample data afterwards with the seeder (Phase 2).
--
-- Works on MySQL 8.0 and MariaDB 10.6+ (XAMPP): no expression defaults, no functional indexes,
-- no utf8mb4_0900_* collations. On MariaDB, JSON is an alias of LONGTEXT and comes back to
-- Node as a string, so the repo layer reads it with parseJson() (src/lib/json.js).
--
-- Conventions (docs/backend-development-phases.md §7.5, §7.6):
--   *_at            instants as BIGINT UNSIGNED milliseconds, the same numbers as Date.now()
--                   (subtracting two of them in SQL fails when the result is negative:
--                   CAST(... AS SIGNED) first)
--   date, need_by   calendar dates as DATE; the pool returns them as 'YYYY-MM-DD' strings
--   start_time      'HH:MM' as CHAR(5)
--   money, counts   whole numbers as signed INT, so SQL arithmetic on them can go below zero
--                   without an "out of range" error; CHECKs keep the stored values in range
--   ids, refs       VARCHAR(40) with the frontend's prefixes (cus-, pay-, RES-…, th-, m-, …)
--   yes/no          BOOLEAN NOT NULL DEFAULT 0: the same TINYINT(1) column on both databases,
--                   written BOOLEAN because MySQL 8 warns that TINYINT(1)'s display width is
--                   deprecated. mysql2 returns 0/1 numbers: Boolean() them in the repo
--   snapshots       JSON (package items, quotation, estimate, chat attachment, …)
--   free text       TEXT NOT NULL with no default (MySQL allows no literal default on TEXT),
--                   so every INSERT must write it, '' when empty
-- The history tables (reservation_activity, inventory_history, outsource_*_history,
-- outsource_deliveries) use an AUTO_INCREMENT id: their rows have no id in the app, are only
-- appended, and ORDER BY at, id keeps entries written in the same millisecond in order.

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS password_resets;
DROP TABLE IF EXISTS auth_challenges;
DROP TABLE IF EXISTS login_attempts;
DROP TABLE IF EXISTS counters;
DROP TABLE IF EXISTS outsource_contract_history;
DROP TABLE IF EXISTS outsource_deliveries;
DROP TABLE IF EXISTS outsource_contracts;
DROP TABLE IF EXISTS outsource_partner_history;
DROP TABLE IF EXISTS outsource_partners;
DROP TABLE IF EXISTS outbox;
DROP TABLE IF EXISTS inventory_history;
DROP TABLE IF EXISTS inventory_allocations;
DROP TABLE IF EXISTS inventory_items;
DROP TABLE IF EXISTS calendar_settings;
DROP TABLE IF EXISTS calendar_blocks;
DROP TABLE IF EXISTS testimonials;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS threads;
DROP TABLE IF EXISTS webhook_events;
DROP TABLE IF EXISTS qr_payments;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS reservation_activity;
DROP TABLE IF EXISTS reservation_damage_charges;
DROP TABLE IF EXISTS reservation_rental_items;
DROP TABLE IF EXISTS reservation_addons;
DROP TABLE IF EXISTS reservations;
DROP TABLE IF EXISTS dishes;
DROP TABLE IF EXISTS addons;
DROP TABLE IF EXISTS packages;
DROP TABLE IF EXISTS catalog_settings;
DROP TABLE IF EXISTS customers;
DROP TABLE IF EXISTS admins;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================================
-- Accounts (authService, Phase 3)
-- ============================================================================

-- Admin accounts: two-stage sign-in (password, then an emailed code) and the
-- sign-in history shown on My account. Never deleted.
CREATE TABLE admins (
  id                        VARCHAR(40)     NOT NULL,             -- adm-…
  name                      VARCHAR(200)    NOT NULL,             -- first and last name, up to 80 characters
  email                     VARCHAR(254)    NOT NULL,             -- unique regardless of case (the collation is case-insensitive)
  mobile                    VARCHAR(20)     NOT NULL DEFAULT '',  -- 09XXXXXXXXX or +639XXXXXXXXX
  password_hash             VARCHAR(255)    NOT NULL,             -- bcrypt; the seed's plain `password` is hashed by the seeder
  role                      VARCHAR(40)     NOT NULL DEFAULT 'Administrator', -- job title shown in the UI; the token role is always 'admin'
  created_at                BIGINT UNSIGNED NOT NULL,
  password_changed_at       BIGINT UNSIGNED NULL,
  last_sign_in_at           BIGINT UNSIGNED NULL,
  last_sign_in_device       VARCHAR(255)    NOT NULL DEFAULT '',  -- e.g. "Chrome · Windows", from the User-Agent
  previous_sign_in_at       BIGINT UNSIGNED NULL,                 -- the sign-in before the last one
  failed_attempts           INT             NOT NULL DEFAULT 0,   -- wrong passwords/codes since the last sign-in
  failed_since_last_sign_in INT             NOT NULL DEFAULT 0,   -- failed_attempts as it was at the last sign-in
  PRIMARY KEY (id),
  UNIQUE KEY uq_admins_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Customer accounts (sign-up, log-in, profile, password reset). The admin directory
-- (customerService, Phase 9) reads the same rows.
CREATE TABLE customers (
  id                  VARCHAR(40)     NOT NULL,             -- cus-…
  first_name          VARCHAR(60)     NOT NULL DEFAULT '',  -- the three parts exist only for accounts made with the
  middle_name         VARCHAR(60)     NOT NULL DEFAULT '',  -- split sign-up form; the profile form clears them when
  last_name           VARCHAR(60)     NOT NULL DEFAULT '',  -- the full name is edited (authService.updateCustomerProfile)
  name                VARCHAR(200)    NOT NULL,             -- full name, shown everywhere
  email               VARCHAR(254)    NOT NULL,             -- stored lower-case; unique
  mobile              VARCHAR(20)     NOT NULL DEFAULT '',  -- receives the password-reset code by SMS
  password_hash       VARCHAR(255)    NOT NULL,
  company             VARCHAR(160)    NOT NULL DEFAULT '',
  created_at          BIGINT UNSIGNED NOT NULL,
  password_changed_at BIGINT UNSIGNED NULL,                 -- tokens issued before this are refused (a reset signs out old sessions)
  PRIMARY KEY (id),
  UNIQUE KEY uq_customers_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Catalog (catalogService, Phase 4)
-- ============================================================================

-- Flat-priced equipment packages. `guests` is how many guests the tableware and chairs cover.
-- A package carries no service type: any of them can be booked as a Buffet (food cooked by us,
-- charged per person) or as Catering only (the equipment on its own). Archived, never deleted.
-- kind 'rental' is the Equipment Rental package: price 0, guests 0, no items; its customer picks
-- rentable inventory items (inventory_items.rentable) and pays each one's rent_price per piece.
CREATE TABLE packages (
  id          VARCHAR(40)  NOT NULL,                     -- pkg-…
  slug        VARCHAR(120) NOT NULL,                     -- URL name made from the name, e.g. package-1-with-waiters
  name        VARCHAR(120) NOT NULL,
  kind        VARCHAR(10)  NOT NULL DEFAULT 'package',   -- 'package' or 'rental'
  price       INT          NOT NULL,
  guests      INT          NOT NULL,
  description TEXT         NOT NULL,
  items       JSON         NOT NULL,                     -- [{ "qty": 100 | null, "name": "Porcelain Plates" }] in display order
  mood        TINYINT      NOT NULL DEFAULT 0,           -- which of the four card images/colours the UI uses (0-3)
  icon        VARCHAR(40)  NOT NULL DEFAULT 'restaurant', -- Material icon name
  featured    BOOLEAN      NOT NULL DEFAULT 0,
  visible     BOOLEAN      NOT NULL DEFAULT 0,           -- new packages start hidden from customers
  archived    BOOLEAN      NOT NULL DEFAULT 0,           -- archiving also hides the package
  PRIMARY KEY (id),
  UNIQUE KEY uq_packages_slug (slug),
  UNIQUE KEY uq_packages_name (name),
  CONSTRAINT chk_packages_kind CHECK (kind IN ('package', 'rental')),
  CONSTRAINT chk_packages_price CHECK (price >= 0),
  CONSTRAINT chk_packages_guests CHECK (guests >= 0)             -- 0 only for the rental package
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Additional charges a customer can tick on the booking form. No price column:
-- the admin prices each one in the quotation (reservations.quotation.addonPrices).
CREATE TABLE addons (
  id           VARCHAR(40)  NOT NULL,            -- add-…
  name         VARCHAR(120) NOT NULL,            -- unique regardless of case
  description  TEXT         NOT NULL,
  -- On: the booking form asks how many (reservation_addons.qty) and the quotation prices ONE of them
  has_quantity BOOLEAN      NOT NULL DEFAULT 0,
  archived     BOOLEAN      NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_addons_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The dishes suggested under each menu box on the booking form. Customers write their own menu
-- lines, so this list guides them without limiting them and an empty category blocks nothing.
-- Archived, never deleted, so the admin can retire a suggestion without losing its history.
CREATE TABLE dishes (
  id       VARCHAR(40)  NOT NULL,                -- dish-…
  category VARCHAR(20)  NOT NULL,                -- one of DISH_CATEGORIES in the shared config
  name     VARCHAR(120) NOT NULL,                -- unique inside its category, regardless of case
  archived BOOLEAN      NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_dishes_category_name (category, name),
  KEY idx_dishes_category (category),
  CONSTRAINT chk_dishes_category CHECK (category IN ('pork', 'chicken', 'fish', 'vegetable'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Catalogue settings: always exactly one row, id = 1 (inserted at the end of this file).
-- `price_per_plate` is what one guest costs on a buffet booking. Changing it only affects new
-- bookings: every reservation stores the rate it was made at (reservations.price_per_plate).
CREATE TABLE catalog_settings (
  id              TINYINT          NOT NULL,
  price_per_plate INT              NOT NULL DEFAULT 600,
  updated_at      BIGINT UNSIGNED  NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT chk_catalog_settings_single_row CHECK (id = 1),
  CONSTRAINT chk_catalog_settings_price CHECK (price_per_plate BETWEEN 100 AND 5000)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Reservations (reservationService, Phase 6)
-- ============================================================================

-- One booking request and where it stands in the pipeline:
-- pending -> approved -> downpayment_paid -> confirmed -> completed, or declined / cancelled.
-- Never deleted; the ref never changes, even when the event moves to another date.
CREATE TABLE reservations (
  ref             VARCHAR(40)     NOT NULL,             -- RES-YYYY-MMDD-NN from the event date (makeReservationRef)
  customer_id     VARCHAR(40)     NOT NULL,
  event_name      VARCHAR(120)    NOT NULL,
  occasion        VARCHAR(40)     NOT NULL,             -- one of OCCASIONS in the shared config
  date            DATE            NOT NULL,             -- event date
  start_time      CHAR(5)         NOT NULL,             -- 'HH:MM', on the hour or half hour
  guests          INT             NOT NULL,             -- may be above what the package covers (charged as other charges); 0 for a rental
  package_id      VARCHAR(40)     NOT NULL,
  -- What the customer booked. 'Buffet and Catering' = our food, charged per person; 'Catering only' =
  -- a package's equipment alone; 'Equipment rental' = items picked one by one (reservation_rental_items).
  service_type    VARCHAR(20)     NOT NULL DEFAULT 'Buffet and Catering',
  -- An equipment rental only: 'pickup' (at our place, free) or 'delivery' (delivery fee in the quotation).
  -- NULL for every other booking.
  fulfilment      VARCHAR(10)     NULL,
  -- The four menu lines as the customer wrote them, e.g.
  -- { "pork": "Lechon Kawali and Crispy Pata", "chicken": …, "fish": …, "vegetable": … }.
  -- Free text, not dish ids: a line may name more than one dish. The `dishes` table only supplies
  -- the autocomplete suggestions. NULL for a Catering only booking, which has no menu.
  menu            JSON            NULL,
  food_notes      TEXT            NOT NULL,             -- allergies, a vegetarian portion…; never changes the price
  -- The buffet price per person this booking was made at, copied from catalog_settings so a later
  -- price rise cannot move an existing reservation or a quotation already sent.
  price_per_plate INT             NOT NULL DEFAULT 0,
  venue_name      VARCHAR(160)    NOT NULL,             -- venue.name   } the record's `venue` object, flattened;
  venue_address   VARCHAR(255)    NOT NULL,             -- venue.address } column names follow the booking form
  city            VARCHAR(120)    NOT NULL,             -- venue.city    } fields (venueName, venueAddress, city,
  access_notes    TEXT            NOT NULL,             -- venue.accessNotes 
  status          VARCHAR(20)     NOT NULL DEFAULT 'pending',
  estimate        JSON            NOT NULL,             -- computeQuote() at booking: package + food (a buffet is priced per person)
  quotation       JSON            NULL,                 -- the last quotation sent: computeQuote() + otherLabel, sentAt, note
  downpayment_due DATE            NULL,                 -- set on approval
  notes           TEXT            NOT NULL,             -- the admin's private notes, never shown to the customer
  decline_reason  TEXT            NOT NULL,
  cancel_reason   TEXT            NOT NULL,
  created_at      BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (ref),
  KEY idx_reservations_date_status (date, status),       -- availability and calendar queries
  KEY idx_reservations_customer (customer_id),
  KEY idx_reservations_package (package_id),
  CONSTRAINT fk_reservations_customer FOREIGN KEY (customer_id) REFERENCES customers (id),
  CONSTRAINT fk_reservations_package FOREIGN KEY (package_id) REFERENCES packages (id),
  CONSTRAINT chk_reservations_status CHECK (status IN ('pending', 'approved', 'downpayment_paid', 'confirmed', 'completed', 'declined', 'cancelled')),
  CONSTRAINT chk_reservations_service_type CHECK (service_type IN ('Buffet and Catering', 'Catering only', 'Equipment rental')),
  CONSTRAINT chk_reservations_fulfilment CHECK (fulfilment IS NULL OR fulfilment IN ('pickup', 'delivery')),
  CONSTRAINT chk_reservations_guests CHECK (guests >= 0)            -- 0 only for an equipment rental
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The add-ons ticked on a reservation (the record's `addonIds` array).
CREATE TABLE reservation_addons (
  reservation_ref VARCHAR(40) NOT NULL,
  addon_id        VARCHAR(40) NOT NULL,
  -- How many were asked for (the record's `addonQty`). Always 1 unless addons.has_quantity is on;
  -- the quotation's line total is the price of one times this.
  qty             SMALLINT    NOT NULL DEFAULT 1,
  sort_order      SMALLINT    NOT NULL DEFAULT 0,       -- position in addonIds, so the array comes back in the same order
  PRIMARY KEY (reservation_ref, addon_id),
  KEY idx_reservation_addons_addon (addon_id),
  CONSTRAINT fk_reservation_addons_reservation FOREIGN KEY (reservation_ref) REFERENCES reservations (ref),
  CONSTRAINT fk_reservation_addons_addon FOREIGN KEY (addon_id) REFERENCES addons (id),
  CONSTRAINT chk_reservation_addons_qty CHECK (qty BETWEEN 1 AND 99)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The reservation's audit trail (the record's `activity` array). Append-only. Written by
-- reservations, payments, inventory check-outs and outsourcing contracts, always in the same
-- transaction as the change it describes.
CREATE TABLE reservation_activity (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  reservation_ref VARCHAR(40)     NOT NULL,
  at              BIGINT UNSIGNED NOT NULL,
  actor           VARCHAR(200)    NOT NULL,             -- name of the customer or admin (or 'PayMongo'), as shown
  text            TEXT            NOT NULL,
  PRIMARY KEY (id),
  KEY idx_reservation_activity_ref_at (reservation_ref, at),
  KEY idx_reservation_activity_at (at),                 -- newest change for the change stamp (Phase 7)
  CONSTRAINT fk_reservation_activity_reservation FOREIGN KEY (reservation_ref) REFERENCES reservations (ref)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Payments (paymentService, Phase 8 and 8B)
-- ============================================================================

-- Money received for a reservation: GCash / bank transfers with proof sent by the customer,
-- cash recorded by the admin, and QR Ph payments confirmed by PayMongo (Phase 8B).
-- Only 'verified' rows count as paid (financials()).
CREATE TABLE payments (
  id            VARCHAR(40)     NOT NULL,               -- pay-#### from the 'payment' counter
  ref           VARCHAR(40)     NOT NULL,               -- the reservation
  customer_id   VARCHAR(40)     NOT NULL,
  amount        INT             NOT NULL,               -- whole pesos
  kind          VARCHAR(20)     NOT NULL,               -- worked out from the amount when it is recorded
  method        VARCHAR(20)     NOT NULL,
  reference_no  VARCHAR(100)    NOT NULL DEFAULT '',    -- transaction number typed by the customer; PayMongo's pay_… for qrph; '' for cash
  proof_key     VARCHAR(255)    NULL,                   -- storage key of the uploaded proof (Phase 8); never sent to the client
  proof_name    VARCHAR(255)    NOT NULL DEFAULT '',    -- the file name the customer uploaded; '' for cash and qrph
  proof_mime    VARCHAR(100)    NULL,                   -- type found from the file's bytes, sent back as Content-Type
  proof_size    INT             NULL,                   -- bytes
  status        VARCHAR(20)     NOT NULL DEFAULT 'awaiting',
  submitted_at  BIGINT UNSIGNED NOT NULL,
  verified_at   BIGINT UNSIGNED NULL,
  verified_by   VARCHAR(40)     NULL,                   -- the admin who verified or recorded it; NULL when PayMongo confirmed it
  receipt_no    VARCHAR(40)     NULL,                   -- OR-#### once verified; NULL (not '') before, so UNIQUE allows many unverified rows
  reject_reason TEXT            NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payments_receipt_no (receipt_no),
  KEY idx_payments_ref (ref),
  KEY idx_payments_customer (customer_id),
  KEY idx_payments_status_verified (status, verified_at), -- badge counts and revenue by verification date (Phase 11)
  CONSTRAINT fk_payments_reservation FOREIGN KEY (ref) REFERENCES reservations (ref),
  CONSTRAINT fk_payments_customer FOREIGN KEY (customer_id) REFERENCES customers (id),
  CONSTRAINT fk_payments_verified_by FOREIGN KEY (verified_by) REFERENCES admins (id),
  CONSTRAINT chk_payments_amount CHECK (amount > 0),
  CONSTRAINT chk_payments_kind CHECK (kind IN ('full', 'downpayment', 'balance')),
  CONSTRAINT chk_payments_method CHECK (method IN ('gcash', 'bank', 'cash', 'qrph')),
  CONSTRAINT chk_payments_status CHECK (status IN ('awaiting', 'verified', 'rejected'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- QR Ph codes opened through PayMongo (Phase 8B, server only). Kept apart from payments so
-- financials() and the status chips never see an unpaid QR: the payments row is created only
-- once PayMongo reports the QR as paid.
CREATE TABLE qr_payments (
  id                  VARCHAR(40)     NOT NULL,             -- qr-…
  ref                 VARCHAR(40)     NOT NULL,
  customer_id         VARCHAR(40)     NOT NULL,
  amount              INT             NOT NULL,             -- whole pesos (PayMongo receives amount * 100)
  intent_id           VARCHAR(64)     NOT NULL,             -- PayMongo Payment Intent, pi_…
  qr_image            MEDIUMTEXT      NOT NULL,             -- base64 data URL of the QR image
  status              VARCHAR(20)     NOT NULL DEFAULT 'pending',
  expires_at          BIGINT UNSIGNED NOT NULL,
  created_at          BIGINT UNSIGNED NOT NULL,
  last_checked_at     BIGINT UNSIGNED NULL,                 -- last time the intent was read from PayMongo (reconcile)
  paid_at             BIGINT UNSIGNED NULL,
  payment_id          VARCHAR(40)     NULL,                 -- our payments row, once paid
  provider_payment_id VARCHAR(64)     NULL,                 -- PayMongo's pay_… (also payments.reference_no)
  failure_reason      VARCHAR(500)    NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_qr_payments_intent (intent_id),
  UNIQUE KEY uq_qr_payments_payment (payment_id),
  UNIQUE KEY uq_qr_payments_provider_payment (provider_payment_id),
  KEY idx_qr_payments_ref_status (ref, status),           -- "is a QR already open for this reservation?"
  KEY idx_qr_payments_customer (customer_id),
  CONSTRAINT fk_qr_payments_reservation FOREIGN KEY (ref) REFERENCES reservations (ref),
  CONSTRAINT fk_qr_payments_customer FOREIGN KEY (customer_id) REFERENCES customers (id),
  CONSTRAINT fk_qr_payments_payment FOREIGN KEY (payment_id) REFERENCES payments (id),
  CONSTRAINT chk_qr_payments_amount CHECK (amount > 0),
  CONSTRAINT chk_qr_payments_status CHECK (status IN ('pending', 'paid', 'expired', 'failed'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- PayMongo webhook events already handled (Phase 8B). The primary key makes a retried
-- event a duplicate-key error, so it is never processed twice.
CREATE TABLE webhook_events (
  id          VARCHAR(64)     NOT NULL,                     -- PayMongo event id, evt_…
  type        VARCHAR(64)     NOT NULL,                     -- e.g. payment.paid
  livemode    BOOLEAN         NOT NULL DEFAULT 0,
  received_at BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Chat (messageService, Phase 7)
-- ============================================================================

-- One conversation per customer with the Tres Marias admin (created on first use).
CREATE TABLE threads (
  id          VARCHAR(40) NOT NULL,                         -- th-…
  customer_id VARCHAR(40) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_threads_customer (customer_id),
  CONSTRAINT fk_threads_customer FOREIGN KEY (customer_id) REFERENCES customers (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Chat messages (the thread's `messages` array). Automatic messages from reservations,
-- payments and feedback replies are written here too, tagged with their reservation.
CREATE TABLE messages (
  id               VARCHAR(40)     NOT NULL,                -- m-…
  thread_id        VARCHAR(40)     NOT NULL,
  from_side        VARCHAR(10)     NOT NULL,                -- the record's `from`: who wrote it
  sender_name      VARCHAR(200)    NOT NULL,
  body             TEXT            NOT NULL,                -- 1-2,000 characters when typed; automatic messages can be longer
  ref              VARCHAR(40)     NULL,                    -- the reservation it is about (a tag on the message), or NULL
  at               BIGINT UNSIGNED NOT NULL,
  read_by_customer BOOLEAN         NOT NULL DEFAULT 0,
  read_by_admin    BOOLEAN         NOT NULL DEFAULT 0,
  attachment       JSON            NULL,                    -- { name, kind: quotation|receipt|contract, ref, paymentId? }
  PRIMARY KEY (id),
  KEY idx_messages_thread_at (thread_id, at),
  KEY idx_messages_ref (ref),
  KEY idx_messages_at (at),                                 -- newest change for the change stamp (Phase 7)
  CONSTRAINT fk_messages_thread FOREIGN KEY (thread_id) REFERENCES threads (id),
  CONSTRAINT fk_messages_reservation FOREIGN KEY (ref) REFERENCES reservations (ref),
  CONSTRAINT chk_messages_from_side CHECK (from_side IN ('customer', 'admin'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Feedback (feedbackService, Phase 9)
-- ============================================================================

-- One review per completed event (UNIQUE ref) and the admin's moderation of it.
-- The only table rows are really deleted from (deleteFeedback); nothing references it.
CREATE TABLE testimonials (
  id              VARCHAR(40)     NOT NULL,                 -- tst-…
  customer_id     VARCHAR(40)     NOT NULL,
  ref             VARCHAR(40)     NOT NULL,
  rating          TINYINT         NOT NULL,                 -- overall stars, 1-5
  cat_food        TINYINT         NOT NULL,                 -- categories.food        } one rating per
  cat_service     TINYINT         NOT NULL,                 -- categories.service     } FEEDBACK_CATEGORIES key,
  cat_punctuality TINYINT         NOT NULL,                 -- categories.punctuality } each 1-5
  cat_setup       TINYINT         NOT NULL,                 -- categories.setup       }
  body            TEXT            NOT NULL,
  created_at      BIGINT UNSIGNED NOT NULL,
  status          VARCHAR(20)     NOT NULL DEFAULT 'hidden', -- 'published' lets the website show it
  featured        BOOLEAN         NOT NULL DEFAULT 0,
  flagged         BOOLEAN         NOT NULL DEFAULT 0,
  flag_reason     TEXT            NOT NULL,                 -- admin only; never sent to the customer or the website
  archived        BOOLEAN         NOT NULL DEFAULT 0,
  read_by_admin   BOOLEAN         NOT NULL DEFAULT 0,
  reply_body      TEXT            NULL,                     -- reply.body } the record's `reply` object;
  reply_at        BIGINT UNSIGNED NULL,                     -- reply.at   } all three NULL when there is
  reply_by        VARCHAR(200)    NULL,                     -- reply.by   } no reply (reply: null)
  PRIMARY KEY (id),
  UNIQUE KEY uq_testimonials_ref (ref),
  KEY idx_testimonials_customer (customer_id),
  CONSTRAINT fk_testimonials_customer FOREIGN KEY (customer_id) REFERENCES customers (id),
  CONSTRAINT fk_testimonials_reservation FOREIGN KEY (ref) REFERENCES reservations (ref),
  CONSTRAINT chk_testimonials_status CHECK (status IN ('hidden', 'published')),
  CONSTRAINT chk_testimonials_ratings CHECK (
    rating BETWEEN 1 AND 5 AND cat_food BETWEEN 1 AND 5 AND cat_service BETWEEN 1 AND 5
    AND cat_punctuality BETWEEN 1 AND 5 AND cat_setup BETWEEN 1 AND 5
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Calendar (calendarService, Phase 5)
-- ============================================================================

-- Dates the admin closed for booking (the record's calendar.blocked array).
CREATE TABLE calendar_blocks (
  date   DATE        NOT NULL,
  reason VARCHAR(60) NOT NULL,                              -- one of BLOCK_REASONS, e.g. 'Fully booked'
  PRIMARY KEY (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The calendar settings: always exactly one row, id = 1 (inserted at the end of this file).
CREATE TABLE calendar_settings (
  id             TINYINT UNSIGNED NOT NULL,
  daily_capacity TINYINT UNSIGNED NOT NULL,                 -- events allowed per date (1-10)
  updated_at     BIGINT UNSIGNED  NOT NULL,                 -- bumped by every calendar write (block, unblock, capacity), so the
                                                            -- change stamp (Phase 7) also sees an unblock, which leaves no row behind
  PRIMARY KEY (id),
  CONSTRAINT chk_calendar_settings_single_row CHECK (id = 1),
  CONSTRAINT chk_calendar_settings_capacity CHECK (daily_capacity BETWEEN 1 AND 10)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Inventory (inventoryService, Phase 10)
-- ============================================================================

-- Equipment Tres Marias owns. In use = sum of the item's allocations;
-- available = total - in use - damaged, and must never go below zero (checked in the service).
CREATE TABLE inventory_items (
  id           VARCHAR(40)  NOT NULL,                       -- inv-…
  code         VARCHAR(40)  NOT NULL,                       -- EQ-#### from the 'inventory' counter
  name         VARCHAR(120) NOT NULL,                       -- unique regardless of case
  category     VARCHAR(40)  NOT NULL,                       -- one of INVENTORY_CATEGORIES
  total        INT          NOT NULL,
  low_stock_at INT          NOT NULL,                       -- alert when available is at or below this
  damaged      INT          NOT NULL DEFAULT 0,
  rentable     BOOLEAN      NOT NULL DEFAULT 0,             -- offered through the Equipment Rental package
  rent_price   INT          NOT NULL DEFAULT 0,             -- per piece for one rental; kept when rentable is switched off
  damage_fee   INT          NOT NULL DEFAULT 0,             -- per piece that comes back damaged or missing
  notes        TEXT         NOT NULL,
  archived     BOOLEAN      NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_inventory_items_code (code),
  UNIQUE KEY uq_inventory_items_name (name),
  CONSTRAINT chk_inventory_items_counts CHECK (total >= 0 AND low_stock_at >= 0 AND damaged >= 0 AND rent_price >= 0 AND damage_fee >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Pieces checked out (the item's `allocations` object: { reservationRef or 'none': qty }).
-- reservation_ref keeps the app's NO_EVENT value 'none' for pieces out without an event, so it
-- has no foreign key; with NULL instead, the primary key could not hold "one row per item and event".
-- A row whose qty would reach 0 is deleted, as the service deletes the key.
CREATE TABLE inventory_allocations (
  item_id         VARCHAR(40) NOT NULL,
  reservation_ref VARCHAR(40) NOT NULL,                     -- RES-… or 'none'
  qty             INT         NOT NULL,
  PRIMARY KEY (item_id, reservation_ref),
  KEY idx_inventory_allocations_ref (reservation_ref),     -- "what is out at this event"
  CONSTRAINT fk_inventory_allocations_item FOREIGN KEY (item_id) REFERENCES inventory_items (id),
  CONSTRAINT chk_inventory_allocations_qty CHECK (qty > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- An item's history (the item's `history` array). Append-only.
CREATE TABLE inventory_history (
  id      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  item_id VARCHAR(40)     NOT NULL,
  at      BIGINT UNSIGNED NOT NULL,
  actor   VARCHAR(200)    NOT NULL,
  text    TEXT            NOT NULL,
  ref     VARCHAR(40)     NULL,                             -- the reservation of a check-out or return; NULL otherwise
  PRIMARY KEY (id),
  KEY idx_inventory_history_item_at (item_id, at),
  KEY idx_inventory_history_ref (ref),
  CONSTRAINT fk_inventory_history_item FOREIGN KEY (item_id) REFERENCES inventory_items (id),
  CONSTRAINT fk_inventory_history_reservation FOREIGN KEY (ref) REFERENCES reservations (ref)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The rental tables of a reservation live here, after inventory_items, because their rows point
-- at both a reservation and an inventory item (reservationService, Phase 6; inventoryService, Phase 10).

-- The items an equipment rental asks for (the record's `rentalItems` array). The name and both prices
-- are copied when the line is booked, so a later price change in the inventory never moves it.
CREATE TABLE reservation_rental_items (
  reservation_ref VARCHAR(40)  NOT NULL,
  item_id         VARCHAR(40)  NOT NULL,
  name            VARCHAR(120) NOT NULL,                  -- the item's name when booked
  qty             INT          NOT NULL,
  price           INT          NOT NULL,                  -- rent per piece when booked
  damage_fee      INT          NOT NULL,                  -- charged per piece that comes back damaged or missing
  sort_order      SMALLINT     NOT NULL DEFAULT 0,        -- position in rentalItems
  PRIMARY KEY (reservation_ref, item_id),
  KEY idx_reservation_rental_items_item (item_id),       -- "what is booked of this item on a date"
  CONSTRAINT fk_reservation_rental_items_reservation FOREIGN KEY (reservation_ref) REFERENCES reservations (ref),
  CONSTRAINT fk_reservation_rental_items_item FOREIGN KEY (item_id) REFERENCES inventory_items (id),
  CONSTRAINT chk_reservation_rental_items_counts CHECK (qty BETWEEN 1 AND 2000 AND price >= 0 AND damage_fee >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Rented pieces that came back damaged or not at all (the record's `damageCharges` array), one row
-- per item, charged at the damage fee the line was booked at. They reach what the customer owes only
-- through a re-sent quotation (reservations.quotation.damage).
CREATE TABLE reservation_damage_charges (
  reservation_ref VARCHAR(40)  NOT NULL,
  item_id         VARCHAR(40)  NOT NULL,
  name            VARCHAR(120) NOT NULL,
  qty             INT          NOT NULL,
  fee             INT          NOT NULL,
  PRIMARY KEY (reservation_ref, item_id),
  CONSTRAINT fk_reservation_damage_charges_reservation FOREIGN KEY (reservation_ref) REFERENCES reservations (ref),
  CONSTRAINT fk_reservation_damage_charges_item FOREIGN KEY (item_id) REFERENCES inventory_items (id),
  CONSTRAINT chk_reservation_damage_charges_counts CHECK (qty > 0 AND fee >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Outbox (integrations/mailer and sms, outbox/outbox.repo.js)
-- ============================================================================

-- Every email and SMS the system sends or logs (log drivers save status 'logged'), so no
-- message is lost before a provider is connected. Created before outsourcing: deliveries point here.
CREATE TABLE outbox (
  id          VARCHAR(40)     NOT NULL,                     -- ob-…
  channel     VARCHAR(10)     NOT NULL,                     -- 'email' or 'sms'
  to_address  VARCHAR(500)    NOT NULL,                     -- email address (possibly "Name <address>") or mobile number
  subject     VARCHAR(255)    NULL,                         -- NULL for SMS
  body        MEDIUMTEXT      NOT NULL,
  status      VARCHAR(20)     NOT NULL,                     -- e.g. 'logged', 'sent', 'failed'
  provider    VARCHAR(40)     NOT NULL,                     -- driver name, e.g. 'log', 'smtp'
  provider_id VARCHAR(255)    NULL,                         -- the provider's message id, once sent
  error       TEXT            NULL,
  meta        JSON            NULL,                         -- what the message is about, e.g. { "contractId": "oc-…" }
  created_at  BIGINT UNSIGNED NOT NULL,
  sent_at     BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  KEY idx_outbox_created (created_at),
  KEY idx_outbox_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Outsourcing (outsourceService, Phase 10)
-- ============================================================================

-- Partners Tres Marias rents from. Each needs an email, a mobile number or both
-- (checked in the service; '' means that channel is missing). Archived, never deleted.
CREATE TABLE outsource_partners (
  id             VARCHAR(40)  NOT NULL,                     -- op-…
  name           VARCHAR(120) NOT NULL,                     -- unique regardless of case
  service        VARCHAR(60)  NOT NULL,                     -- one of OUTSOURCE_SERVICES
  contact_person VARCHAR(120) NOT NULL DEFAULT '',
  email          VARCHAR(254) NOT NULL DEFAULT '',
  mobile         VARCHAR(20)  NOT NULL DEFAULT '',
  address        VARCHAR(255) NOT NULL DEFAULT '',
  notes          TEXT         NOT NULL,
  archived       BOOLEAN      NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_outsource_partners_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A partner's history (the partner's `history` array). Append-only.
CREATE TABLE outsource_partner_history (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  partner_id VARCHAR(40)     NOT NULL,
  at         BIGINT UNSIGNED NOT NULL,
  actor      VARCHAR(200)    NOT NULL,
  text       TEXT            NOT NULL,
  PRIMARY KEY (id),
  KEY idx_outsource_partner_history_partner_at (partner_id, at),
  CONSTRAINT fk_outsource_partner_history_partner FOREIGN KEY (partner_id) REFERENCES outsource_partners (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Rental contracts sent to partners: draft -> sent -> accepted / declined; accepted -> completed;
-- cancelled from draft, sent or accepted. Only drafts can be edited.
-- reservation_ref keeps the app's NO_EVENT value 'none' (no foreign key), like inventory_allocations,
-- so both tables store the value the app uses.
CREATE TABLE outsource_contracts (
  id              VARCHAR(40)     NOT NULL,                 -- oc-…
  ref             VARCHAR(40)     NOT NULL,                 -- OUT-YYYY-#### from the 'outsource' counter
  partner_id      VARCHAR(40)     NOT NULL,
  reservation_ref VARCHAR(40)     NOT NULL DEFAULT 'none',  -- RES-… or 'none'
  items           JSON            NOT NULL,                 -- [{ "name": "Monobloc chair", "qty": 150 }]
  need_by         DATE            NOT NULL,
  amount          INT             NOT NULL DEFAULT 0,       -- agreed amount in whole pesos, 0-10,000,000
  notes           TEXT            NOT NULL,
  status          VARCHAR(20)     NOT NULL DEFAULT 'draft',
  body            TEXT            NOT NULL,                 -- the exact text last sent (every channel gets the same); '' for a draft
  created_at      BIGINT UNSIGNED NOT NULL,
  sent_at         BIGINT UNSIGNED NULL,
  answered_at     BIGINT UNSIGNED NULL,                     -- when the partner accepted or declined
  answer_note     TEXT            NOT NULL,                 -- the reason given with a decline or cancellation
  PRIMARY KEY (id),
  UNIQUE KEY uq_outsource_contracts_ref (ref),
  KEY idx_outsource_contracts_partner (partner_id),
  KEY idx_outsource_contracts_reservation (reservation_ref),
  CONSTRAINT fk_outsource_contracts_partner FOREIGN KEY (partner_id) REFERENCES outsource_partners (id),
  CONSTRAINT chk_outsource_contracts_amount CHECK (amount >= 0),
  CONSTRAINT chk_outsource_contracts_status CHECK (status IN ('draft', 'sent', 'accepted', 'declined', 'completed', 'cancelled'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Each time a contract went out on one channel (the contract's `deliveries` array).
-- Append-only; resending adds rows.
CREATE TABLE outsource_deliveries (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  contract_id VARCHAR(40)     NOT NULL,
  channel     VARCHAR(10)     NOT NULL,
  to_address  VARCHAR(254)    NOT NULL,                     -- the record's `to`: the partner's email or mobile number
  at          BIGINT UNSIGNED NOT NULL,
  body        TEXT            NOT NULL,
  outbox_id   VARCHAR(40)     NULL,                         -- the outbox row of this delivery (NULL for seeded ones). SET NULL
                                                            -- rather than RESTRICT: pruning old outbox rows must not be blocked,
                                                            -- and the delivery keeps its own copy of the text
  PRIMARY KEY (id),
  KEY idx_outsource_deliveries_contract_at (contract_id, at),
  KEY idx_outsource_deliveries_outbox (outbox_id),
  CONSTRAINT fk_outsource_deliveries_contract FOREIGN KEY (contract_id) REFERENCES outsource_contracts (id),
  CONSTRAINT fk_outsource_deliveries_outbox FOREIGN KEY (outbox_id) REFERENCES outbox (id) ON DELETE SET NULL,
  CONSTRAINT chk_outsource_deliveries_channel CHECK (channel IN ('email', 'sms'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A contract's history (the contract's `history` array). Append-only.
CREATE TABLE outsource_contract_history (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  contract_id VARCHAR(40)     NOT NULL,
  at          BIGINT UNSIGNED NOT NULL,
  actor       VARCHAR(200)    NOT NULL,
  text        TEXT            NOT NULL,
  PRIMARY KEY (id),
  KEY idx_outsource_contract_history_contract_at (contract_id, at),
  CONSTRAINT fk_outsource_contract_history_contract FOREIGN KEY (contract_id) REFERENCES outsource_contracts (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Counters (src/lib/ids.js nextCounter)
-- ============================================================================

-- Sequential numbers: receipt (OR-####), payment (pay-####), inventory (EQ-####) and
-- outsource (OUT-YYYY-####). `value` is always the LAST number used; nextCounter() adds 1
-- under SELECT … FOR UPDATE inside the caller's transaction. (The seed's `receipt` is the NEXT
-- number instead, so the seeder stores it minus 1: §7.6.)
CREATE TABLE counters (
  name  VARCHAR(40)  NOT NULL,
  value INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Sign-in protection (authService, Phase 3) — replaces what the browser kept in
-- localStorage / sessionStorage (tm.auth.attempts, tm.auth.challenge,
-- tm.auth.contactChallenge, tm.auth.resetChallenge)
-- ============================================================================

-- Failed attempts and lockouts, one row per scope and account.
-- Scopes used by authService: 'customer', 'admin' (password, keyed by email), 'admin-code',
-- 'reset-code' (codes, keyed by email), 'customer-reauth', 'admin-reauth' (current password
-- before a change, keyed by account id) and 'admin-contact' (contact-change code, keyed by admin id).
CREATE TABLE login_attempts (
  scope        VARCHAR(20)     NOT NULL,
  identifier   VARCHAR(254)    NOT NULL,                    -- lower-case email or account id, per scope
  count        INT             NOT NULL DEFAULT 0,          -- failures since the last success or lock
  locked_until BIGINT UNSIGNED NULL,
  updated_at   BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (scope, identifier)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Emailed 6-digit codes for admins: the second sign-in step, and confirming a new email or
-- mobile number. Only a hash of the code is kept.
CREATE TABLE auth_challenges (
  id         VARCHAR(40)     NOT NULL,                      -- handed to the browser as challengeId
  purpose    VARCHAR(20)     NOT NULL,
  admin_id   VARCHAR(40)     NOT NULL,
  code_hash  VARCHAR(255)    NOT NULL,
  field      VARCHAR(10)     NULL,                          -- contact_change only: which contact is changing
  new_value  VARCHAR(254)    NULL,                          -- contact_change only: the new email or mobile number
  expires_at BIGINT UNSIGNED NOT NULL,                      -- a resend moves expires_at and resend_at
  resend_at  BIGINT UNSIGNED NOT NULL,
  attempts   INT             NOT NULL DEFAULT 0,
  used_at    BIGINT UNSIGNED NULL,                          -- set once the code is accepted; a used challenge is dead
  created_at BIGINT UNSIGNED NOT NULL,                      -- for per-account rate limits and clean-up
  PRIMARY KEY (id),
  KEY idx_auth_challenges_admin (admin_id),
  CONSTRAINT fk_auth_challenges_admin FOREIGN KEY (admin_id) REFERENCES admins (id),
  CONSTRAINT chk_auth_challenges_purpose CHECK (purpose IN ('sign_in', 'contact_change')),
  CONSTRAINT chk_auth_challenges_field CHECK (field IS NULL OR field IN ('email', 'mobile'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Customer forgot-password requests: a 6-digit code texted to the mobile on the account,
-- then the new password. Only a hash of the code is kept.
CREATE TABLE password_resets (
  id          VARCHAR(40)     NOT NULL,                     -- handed to the browser as challengeId
  customer_id VARCHAR(40)     NOT NULL,
  code_hash   VARCHAR(255)    NOT NULL,
  expires_at  BIGINT UNSIGNED NOT NULL,                     -- extended once the code is verified, to choose the password
  resend_at   BIGINT UNSIGNED NOT NULL,
  attempts    INT             NOT NULL DEFAULT 0,
  verified_at BIGINT UNSIGNED NULL,                         -- the code was right; the new password may be saved
  used_at     BIGINT UNSIGNED NULL,                         -- the password was changed; the request is spent
  created_at  BIGINT UNSIGNED NOT NULL,                     -- for the per-email rate limit and clean-up
  PRIMARY KEY (id),
  KEY idx_password_resets_customer (customer_id),
  CONSTRAINT fk_password_resets_customer FOREIGN KEY (customer_id) REFERENCES customers (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Rows the API needs even before any data is loaded. The seeder (Phase 2) empties
-- and refills every table, these two included.
-- ============================================================================

-- The one catalogue settings row: the buffet price per person, as in the seed
INSERT INTO catalog_settings (id, price_per_plate, updated_at) VALUES (1, 600, UNIX_TIMESTAMP() * 1000);

-- The one calendar settings row: 2 events a day, as in the seed
INSERT INTO calendar_settings (id, daily_capacity, updated_at) VALUES (1, 2, UNIX_TIMESTAMP() * 1000);

-- Every counter at 0 (nothing used yet), so nextCounter() works on a fresh database
INSERT INTO counters (name, value) VALUES ('receipt', 0), ('payment', 0), ('inventory', 0), ('outsource', 0);
