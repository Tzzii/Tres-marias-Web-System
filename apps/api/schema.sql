
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS password_changes;
DROP TABLE IF EXISTS customer_email_changes;
DROP TABLE IF EXISTS signup_requests;
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
DROP TABLE IF EXISTS refunds;
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


CREATE TABLE admins (
  id                        VARCHAR(40)     NOT NULL,
  name                      VARCHAR(200)    NOT NULL,
  email                     VARCHAR(254)    NOT NULL,
  mobile                    VARCHAR(20)     NOT NULL DEFAULT '',
  password_hash             VARCHAR(255)    NOT NULL,
  role                      VARCHAR(40)     NOT NULL DEFAULT 'Administrator',
  created_at                BIGINT UNSIGNED NOT NULL,
  password_changed_at       BIGINT UNSIGNED NULL,
  session_id                VARCHAR(40)     NULL,
  last_sign_in_at           BIGINT UNSIGNED NULL,
  last_sign_in_device       VARCHAR(255)    NOT NULL DEFAULT '',
  previous_sign_in_at       BIGINT UNSIGNED NULL,
  failed_attempts           INT             NOT NULL DEFAULT 0,
  failed_since_last_sign_in INT             NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_admins_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE customers (
  id                  VARCHAR(40)     NOT NULL,
  first_name          VARCHAR(60)     NOT NULL DEFAULT '',
  middle_name         VARCHAR(60)     NOT NULL DEFAULT '',
  last_name           VARCHAR(60)     NOT NULL DEFAULT '',
  name                VARCHAR(200)    NOT NULL,
  email               VARCHAR(254)    NOT NULL,
  mobile              VARCHAR(20)     NOT NULL DEFAULT '',
  password_hash       VARCHAR(255)    NULL,
  company             VARCHAR(160)    NOT NULL DEFAULT '',
  created_at          BIGINT UNSIGNED NOT NULL,
  password_changed_at BIGINT UNSIGNED NULL,
  terms_version       VARCHAR(20)     NOT NULL DEFAULT '',
  terms_accepted_at   BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_customers_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE customer_google_accounts (
  google_subject VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  customer_id    VARCHAR(40) NOT NULL,
  PRIMARY KEY (google_subject),
  UNIQUE KEY uq_google_customer (customer_id),
  CONSTRAINT fk_google_customer FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE packages (
  id          VARCHAR(40)  NOT NULL,
  slug        VARCHAR(120) NOT NULL,
  name        VARCHAR(120) NOT NULL,
  kind        VARCHAR(10)  NOT NULL DEFAULT 'package',
  price       INT          NOT NULL,
  guests      INT          NOT NULL,
  description TEXT         NOT NULL,
  items       JSON         NOT NULL,
  photo_key   VARCHAR(255) NULL,
  photo_mime  VARCHAR(40)  NULL,
  mood        TINYINT      NOT NULL DEFAULT 0,
  icon        VARCHAR(40)  NOT NULL DEFAULT 'restaurant',
  featured    BOOLEAN      NOT NULL DEFAULT 0,
  visible     BOOLEAN      NOT NULL DEFAULT 0,
  archived    BOOLEAN      NOT NULL DEFAULT 0,
  sort_order  INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_packages_slug (slug),
  UNIQUE KEY uq_packages_name (name),
  CONSTRAINT chk_packages_kind CHECK (kind IN ('package', 'rental')),
  CONSTRAINT chk_packages_price CHECK (price >= 0),
  CONSTRAINT chk_packages_guests CHECK (guests >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE addons (
  id           VARCHAR(40)  NOT NULL,
  parent_id    VARCHAR(40)  NULL,
  name         VARCHAR(120) NOT NULL,
  description  TEXT         NOT NULL,
  price        INT          NULL,
  has_quantity BOOLEAN      NOT NULL DEFAULT 0,
  has_packages BOOLEAN      NOT NULL DEFAULT 0,
  archived     BOOLEAN      NOT NULL DEFAULT 0,
  sort_order   INT          NOT NULL DEFAULT 0,
  parent_key   VARCHAR(40)  AS (COALESCE(parent_id, '')) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_addons_name (parent_key, name),
  KEY idx_addons_parent (parent_id),
  CONSTRAINT fk_addons_parent FOREIGN KEY (parent_id) REFERENCES addons (id),
  CONSTRAINT chk_addons_price CHECK (price IS NULL OR price BETWEEN 1 AND 1000000)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE dishes (
  id       VARCHAR(40)  NOT NULL,
  category VARCHAR(20)  NOT NULL,
  name     VARCHAR(120) NOT NULL,
  archived BOOLEAN      NOT NULL DEFAULT 0,
  sort_order INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_dishes_category_name (category, name),
  KEY idx_dishes_category (category),
  CONSTRAINT chk_dishes_category CHECK (category IN ('pork', 'chicken', 'fish', 'vegetable'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE catalog_settings (
  id              TINYINT          NOT NULL,
  price_per_plate INT              NOT NULL DEFAULT 600,
  min_downpayment INT              NOT NULL DEFAULT 3000,
  six_hour_fee    INT              NOT NULL DEFAULT 5000 CHECK (six_hour_fee BETWEEN 0 AND 50000),
  bank_name       VARCHAR(80)      NOT NULL DEFAULT 'BPI',
  bank_account_name VARCHAR(120)   NOT NULL DEFAULT 'Tres Marias Catering Services',
  bank_account_number VARCHAR(40)  NOT NULL DEFAULT '4471 0839 26',
  hero_photo_key  VARCHAR(255)     NULL,
  hero_photo_mime VARCHAR(40)      NULL,
  updated_at      BIGINT UNSIGNED  NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT chk_catalog_settings_single_row CHECK (id = 1),
  CONSTRAINT chk_catalog_settings_price CHECK (price_per_plate BETWEEN 100 AND 5000),
  CONSTRAINT chk_catalog_settings_min_downpayment CHECK (min_downpayment BETWEEN 1000 AND 100000)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE reservations (
  ref             VARCHAR(40)     NOT NULL,
  customer_id     VARCHAR(40)     NOT NULL,
  event_name      VARCHAR(120)    NOT NULL,
  occasion        VARCHAR(40)     NOT NULL,
  date            DATE            NOT NULL,
  start_time      CHAR(5)         NOT NULL,
  end_time        CHAR(5)         NULL,
  guests          INT             NOT NULL,
  package_id      VARCHAR(40)     NOT NULL,
  service_type    VARCHAR(20)     NOT NULL DEFAULT 'Buffet and Catering',
  fulfilment      VARCHAR(10)     NULL,
  menu            JSON            NULL,
  food_notes      TEXT            NOT NULL,
  styling         JSON            NULL,
  price_per_plate INT             NOT NULL DEFAULT 0,
  min_downpayment INT             NOT NULL DEFAULT 3000,
  venue_name      VARCHAR(160)    NOT NULL,
  venue_address   VARCHAR(255)    NOT NULL,
  city            VARCHAR(120)    NOT NULL,
  access_notes    TEXT            NOT NULL,
  status          VARCHAR(20)     NOT NULL DEFAULT 'pending',
  estimate        JSON            NOT NULL,
  quotation       JSON            NULL,
  downpayment_due DATE            NULL,
  preparing_at    BIGINT UNSIGNED NULL,
  notes           TEXT            NOT NULL,
  decline_reason  TEXT            NOT NULL,
  cancel_reason   TEXT            NOT NULL,
  cancelled_by    VARCHAR(10)     NULL,
  created_at      BIGINT UNSIGNED NOT NULL,
  terms_version   VARCHAR(20)     NOT NULL DEFAULT '',
  PRIMARY KEY (ref),
  KEY idx_reservations_date_status (date, status),
  KEY idx_reservations_customer (customer_id),
  KEY idx_reservations_package (package_id),
  CONSTRAINT fk_reservations_customer FOREIGN KEY (customer_id) REFERENCES customers (id),
  CONSTRAINT fk_reservations_package FOREIGN KEY (package_id) REFERENCES packages (id),
  CONSTRAINT chk_reservations_status CHECK (status IN ('pending', 'approved', 'downpayment_paid', 'confirmed', 'completed', 'declined', 'cancelled')),
  CONSTRAINT chk_reservations_service_type CHECK (service_type IN ('Buffet and Catering', 'Catering only', 'Equipment rental')),
  CONSTRAINT chk_reservations_fulfilment CHECK (fulfilment IS NULL OR fulfilment IN ('pickup', 'delivery')),
  CONSTRAINT chk_reservations_guests CHECK (guests >= 0),
  CONSTRAINT chk_reservations_min_downpayment CHECK (min_downpayment >= 0),
  CONSTRAINT chk_reservations_cancelled_by CHECK (cancelled_by IS NULL OR cancelled_by IN ('customer', 'admin'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE reservation_addons (
  reservation_ref VARCHAR(40) NOT NULL,
  addon_id        VARCHAR(40) NOT NULL,
  qty             SMALLINT    NOT NULL DEFAULT 1,
  sort_order      SMALLINT    NOT NULL DEFAULT 0,
  PRIMARY KEY (reservation_ref, addon_id),
  KEY idx_reservation_addons_addon (addon_id),
  CONSTRAINT fk_reservation_addons_reservation FOREIGN KEY (reservation_ref) REFERENCES reservations (ref),
  CONSTRAINT fk_reservation_addons_addon FOREIGN KEY (addon_id) REFERENCES addons (id),
  CONSTRAINT chk_reservation_addons_qty CHECK (qty BETWEEN 1 AND 99)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE reservation_activity (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  reservation_ref VARCHAR(40)     NOT NULL,
  at              BIGINT UNSIGNED NOT NULL,
  actor           VARCHAR(200)    NOT NULL,
  text            TEXT            NOT NULL,
  PRIMARY KEY (id),
  KEY idx_reservation_activity_ref_at (reservation_ref, at),
  KEY idx_reservation_activity_at (at),
  CONSTRAINT fk_reservation_activity_reservation FOREIGN KEY (reservation_ref) REFERENCES reservations (ref)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE payments (
  id            VARCHAR(40)     NOT NULL,
  ref           VARCHAR(40)     NOT NULL,
  customer_id   VARCHAR(40)     NOT NULL,
  amount        INT             NOT NULL,
  kind          VARCHAR(20)     NOT NULL,
  method        VARCHAR(20)     NOT NULL,
  reference_no  VARCHAR(100)    NOT NULL DEFAULT '',
  proof_key     VARCHAR(255)    NULL,
  proof_name    VARCHAR(255)    NOT NULL DEFAULT '',
  proof_mime    VARCHAR(100)    NULL,
  proof_size    INT             NULL,
  status        VARCHAR(20)     NOT NULL DEFAULT 'awaiting',
  submitted_at  BIGINT UNSIGNED NOT NULL,
  verified_at   BIGINT UNSIGNED NULL,
  verified_by   VARCHAR(40)     NULL,
  receipt_no    VARCHAR(40)     NULL,
  reject_reason TEXT            NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payments_receipt_no (receipt_no),
  KEY idx_payments_ref (ref),
  KEY idx_payments_customer (customer_id),
  KEY idx_payments_status_verified (status, verified_at),
  CONSTRAINT fk_payments_reservation FOREIGN KEY (ref) REFERENCES reservations (ref),
  CONSTRAINT fk_payments_customer FOREIGN KEY (customer_id) REFERENCES customers (id),
  CONSTRAINT fk_payments_verified_by FOREIGN KEY (verified_by) REFERENCES admins (id),
  CONSTRAINT chk_payments_amount CHECK (amount > 0),
  CONSTRAINT chk_payments_kind CHECK (kind IN ('full', 'downpayment', 'balance')),
  CONSTRAINT chk_payments_method CHECK (method IN ('bank', 'cash', 'qrph')),
  CONSTRAINT chk_payments_status CHECK (status IN ('awaiting', 'verified', 'rejected'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE refunds (
  id           VARCHAR(40)     NOT NULL,
  ref          VARCHAR(40)     NOT NULL,
  customer_id  VARCHAR(40)     NOT NULL,
  kind         VARCHAR(20)     NOT NULL,
  amount       INT             NOT NULL,
  due          INT             NOT NULL,
  method       VARCHAR(20)     NOT NULL DEFAULT '',
  reference_no VARCHAR(30)     NOT NULL DEFAULT '',
  sent_on      DATE            NOT NULL,
  reason       TEXT            NOT NULL,
  recorded_at  BIGINT UNSIGNED NOT NULL,
  recorded_by  VARCHAR(40)     NOT NULL,
  PRIMARY KEY (id),
  KEY idx_refunds_ref (ref),
  KEY idx_refunds_customer (customer_id),
  KEY idx_refunds_sent_on (sent_on),
  CONSTRAINT fk_refunds_reservation FOREIGN KEY (ref) REFERENCES reservations (ref),
  CONSTRAINT fk_refunds_customer FOREIGN KEY (customer_id) REFERENCES customers (id),
  CONSTRAINT fk_refunds_recorded_by FOREIGN KEY (recorded_by) REFERENCES admins (id),
  CONSTRAINT chk_refunds_kind CHECK (kind IN ('cancellation', 'overpayment')),
  CONSTRAINT chk_refunds_amount CHECK (amount >= 0 AND amount <= due),
  CONSTRAINT chk_refunds_overpayment CHECK (kind = 'cancellation' OR amount > 0),
  CONSTRAINT chk_refunds_method CHECK (method IN ('', 'gcash', 'bank', 'cash') AND (amount = 0) = (method = ''))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE qr_payments (
  id                  VARCHAR(40)     NOT NULL,
  ref                 VARCHAR(40)     NOT NULL,
  customer_id         VARCHAR(40)     NOT NULL,
  amount              INT             NOT NULL,
  intent_id           VARCHAR(64)     NOT NULL,
  code_id             VARCHAR(64)     NULL,
  qr_image            MEDIUMTEXT      NOT NULL,
  status              VARCHAR(20)     NOT NULL DEFAULT 'pending',
  expires_at          BIGINT UNSIGNED NOT NULL,
  created_at          BIGINT UNSIGNED NOT NULL,
  last_checked_at     BIGINT UNSIGNED NULL,
  paid_at             BIGINT UNSIGNED NULL,
  payment_id          VARCHAR(40)     NULL,
  provider_payment_id VARCHAR(64)     NULL,
  failure_reason      VARCHAR(500)    NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_qr_payments_intent (intent_id),
  UNIQUE KEY uq_qr_payments_payment (payment_id),
  UNIQUE KEY uq_qr_payments_provider_payment (provider_payment_id),
  KEY idx_qr_payments_ref_status (ref, status),
  KEY idx_qr_payments_customer (customer_id),
  CONSTRAINT fk_qr_payments_reservation FOREIGN KEY (ref) REFERENCES reservations (ref),
  CONSTRAINT fk_qr_payments_customer FOREIGN KEY (customer_id) REFERENCES customers (id),
  CONSTRAINT fk_qr_payments_payment FOREIGN KEY (payment_id) REFERENCES payments (id),
  CONSTRAINT chk_qr_payments_amount CHECK (amount > 0),
  CONSTRAINT chk_qr_payments_status CHECK (status IN ('pending', 'paid', 'expired', 'failed'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE webhook_events (
  id          VARCHAR(255)    NOT NULL,
  type        VARCHAR(64)     NOT NULL,
  livemode    BOOLEAN         NOT NULL DEFAULT 0,
  received_at BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE threads (
  id          VARCHAR(40) NOT NULL,
  customer_id VARCHAR(40) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_threads_customer (customer_id),
  CONSTRAINT fk_threads_customer FOREIGN KEY (customer_id) REFERENCES customers (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE messages (
  id               VARCHAR(40)     NOT NULL,
  thread_id        VARCHAR(40)     NOT NULL,
  from_side        VARCHAR(10)     NOT NULL,
  sender_name      VARCHAR(200)    NOT NULL,
  body             TEXT            NOT NULL,
  ref              VARCHAR(40)     NULL,
  at               BIGINT UNSIGNED NOT NULL,
  read_by_customer BOOLEAN         NOT NULL DEFAULT 0,
  read_by_admin    BOOLEAN         NOT NULL DEFAULT 0,
  attachment       JSON            NULL,
  typed            BOOLEAN         NOT NULL DEFAULT 0,
  edited_at        BIGINT UNSIGNED NULL,
  deleted_at       BIGINT UNSIGNED NULL,
  history          JSON            NULL,
  PRIMARY KEY (id),
  KEY idx_messages_thread_at (thread_id, at),
  KEY idx_messages_ref (ref),
  KEY idx_messages_at (at),
  CONSTRAINT fk_messages_thread FOREIGN KEY (thread_id) REFERENCES threads (id),
  CONSTRAINT fk_messages_reservation FOREIGN KEY (ref) REFERENCES reservations (ref),
  CONSTRAINT chk_messages_from_side CHECK (from_side IN ('customer', 'admin'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE testimonials (
  id              VARCHAR(40)     NOT NULL,
  customer_id     VARCHAR(40)     NOT NULL,
  ref             VARCHAR(40)     NOT NULL,
  rating          TINYINT         NOT NULL,
  cat_food        TINYINT         NOT NULL,
  cat_service     TINYINT         NOT NULL,
  cat_punctuality TINYINT         NOT NULL,
  cat_setup       TINYINT         NOT NULL,
  body            TEXT            NOT NULL,
  created_at      BIGINT UNSIGNED NOT NULL,
  status          VARCHAR(20)     NOT NULL DEFAULT 'hidden',
  featured        BOOLEAN         NOT NULL DEFAULT 0,
  flagged         BOOLEAN         NOT NULL DEFAULT 0,
  flag_reason     TEXT            NOT NULL,
  archived        BOOLEAN         NOT NULL DEFAULT 0,
  read_by_admin   BOOLEAN         NOT NULL DEFAULT 0,
  reply_body      TEXT            NULL,
  reply_at        BIGINT UNSIGNED NULL,
  reply_by        VARCHAR(200)    NULL,
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


CREATE TABLE calendar_blocks (
  date   DATE        NOT NULL,
  reason VARCHAR(60) NOT NULL,
  note   VARCHAR(120) NOT NULL DEFAULT '',
  PRIMARY KEY (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE calendar_settings (
  id             TINYINT UNSIGNED NOT NULL,
  daily_capacity TINYINT UNSIGNED NOT NULL,
  updated_at     BIGINT UNSIGNED  NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT chk_calendar_settings_single_row CHECK (id = 1),
  CONSTRAINT chk_calendar_settings_capacity CHECK (daily_capacity BETWEEN 1 AND 10)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE inventory_items (
  id           VARCHAR(40)  NOT NULL,
  code         VARCHAR(40)  NOT NULL,
  name         VARCHAR(120) NOT NULL,
  category     VARCHAR(40)  NOT NULL,
  total        INT          NOT NULL,
  low_stock_at INT          NOT NULL,
  damaged      INT          NOT NULL DEFAULT 0,
  rentable     BOOLEAN      NOT NULL DEFAULT 0,
  rent_price   INT          NOT NULL DEFAULT 0,
  damage_fee   INT          NOT NULL DEFAULT 0,
  photo_key    VARCHAR(255) NULL,
  photo_mime   VARCHAR(40)  NULL,
  notes        TEXT         NOT NULL,
  archived     BOOLEAN      NOT NULL DEFAULT 0,
  addon_id     VARCHAR(40)  NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_inventory_items_code (code),
  UNIQUE KEY uq_inventory_items_name (name),
  UNIQUE KEY uq_inventory_items_addon (addon_id),
  CONSTRAINT fk_inventory_items_addon FOREIGN KEY (addon_id) REFERENCES addons (id),
  CONSTRAINT chk_inventory_items_counts CHECK (total >= 0 AND low_stock_at >= 0 AND damaged >= 0 AND rent_price >= 0 AND damage_fee >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE inventory_allocations (
  item_id         VARCHAR(40) NOT NULL,
  reservation_ref VARCHAR(40) NOT NULL,
  qty             INT         NOT NULL,
  PRIMARY KEY (item_id, reservation_ref),
  KEY idx_inventory_allocations_ref (reservation_ref),
  CONSTRAINT fk_inventory_allocations_item FOREIGN KEY (item_id) REFERENCES inventory_items (id),
  CONSTRAINT chk_inventory_allocations_qty CHECK (qty > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE rental_dispatches (
  reservation_ref VARCHAR(40) NOT NULL,
  item_id         VARCHAR(40) NOT NULL,
  qty             INT NOT NULL,
  dispatched_at   BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (reservation_ref, item_id),
  CONSTRAINT fk_rental_dispatches_reservation FOREIGN KEY (reservation_ref) REFERENCES reservations (ref),
  CONSTRAINT fk_rental_dispatches_item FOREIGN KEY (item_id) REFERENCES inventory_items (id),
  CONSTRAINT chk_rental_dispatches_qty CHECK (qty > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE inventory_history (
  id      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  item_id VARCHAR(40)     NOT NULL,
  at      BIGINT UNSIGNED NOT NULL,
  actor   VARCHAR(200)    NOT NULL,
  text    TEXT            NOT NULL,
  ref     VARCHAR(40)     NULL,
  PRIMARY KEY (id),
  KEY idx_inventory_history_item_at (item_id, at),
  KEY idx_inventory_history_ref (ref),
  CONSTRAINT fk_inventory_history_item FOREIGN KEY (item_id) REFERENCES inventory_items (id),
  CONSTRAINT fk_inventory_history_reservation FOREIGN KEY (ref) REFERENCES reservations (ref)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE reservation_rental_items (
  reservation_ref VARCHAR(40)  NOT NULL,
  item_id         VARCHAR(40)  NOT NULL,
  name            VARCHAR(120) NOT NULL,
  qty             INT          NOT NULL,
  price           INT          NOT NULL,
  damage_fee      INT          NOT NULL,
  sort_order      SMALLINT     NOT NULL DEFAULT 0,
  PRIMARY KEY (reservation_ref, item_id),
  KEY idx_reservation_rental_items_item (item_id),
  CONSTRAINT fk_reservation_rental_items_reservation FOREIGN KEY (reservation_ref) REFERENCES reservations (ref),
  CONSTRAINT fk_reservation_rental_items_item FOREIGN KEY (item_id) REFERENCES inventory_items (id),
  CONSTRAINT chk_reservation_rental_items_counts CHECK (qty BETWEEN 1 AND 2000 AND price >= 0 AND damage_fee >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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


CREATE TABLE outbox (
  id          VARCHAR(40)     NOT NULL,
  channel     VARCHAR(10)     NOT NULL,
  to_address  VARCHAR(500)    NOT NULL,
  subject     VARCHAR(255)    NULL,
  body        MEDIUMTEXT      NOT NULL,
  status      VARCHAR(20)     NOT NULL,
  provider    VARCHAR(40)     NOT NULL,
  provider_id VARCHAR(255)    NULL,
  error       TEXT            NULL,
  meta        JSON            NULL,
  created_at  BIGINT UNSIGNED NOT NULL,
  sent_at     BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  KEY idx_outbox_created (created_at),
  KEY idx_outbox_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE outsource_partners (
  id             VARCHAR(40)  NOT NULL,
  name           VARCHAR(120) NOT NULL,
  service        VARCHAR(60)  NOT NULL,
  contact_person VARCHAR(120) NOT NULL DEFAULT '',
  email          VARCHAR(254) NOT NULL DEFAULT '',
  mobile         VARCHAR(20)  NOT NULL DEFAULT '',
  address        VARCHAR(255) NOT NULL DEFAULT '',
  notes          TEXT         NOT NULL,
  archived       BOOLEAN      NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_outsource_partners_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

CREATE TABLE outsource_contracts (
  id              VARCHAR(40)     NOT NULL,
  ref             VARCHAR(40)     NOT NULL,
  partner_id      VARCHAR(40)     NULL,
  reservation_ref VARCHAR(40)     NOT NULL DEFAULT 'none',
  items           JSON            NOT NULL,
  need_by         DATE            NOT NULL,
  amount          INT             NOT NULL DEFAULT 0,
  notes           TEXT            NOT NULL,
  status          VARCHAR(20)     NOT NULL DEFAULT 'draft',
  body            TEXT            NOT NULL,
  created_at      BIGINT UNSIGNED NOT NULL,
  sent_at         BIGINT UNSIGNED NULL,
  answered_at     BIGINT UNSIGNED NULL,
  answer_note     TEXT            NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_outsource_contracts_ref (ref),
  KEY idx_outsource_contracts_partner (partner_id),
  KEY idx_outsource_contracts_reservation (reservation_ref),
  CONSTRAINT fk_outsource_contracts_partner_delete FOREIGN KEY (partner_id) REFERENCES outsource_partners (id) ON DELETE SET NULL,
  CONSTRAINT chk_outsource_contracts_amount CHECK (amount >= 0),
  CONSTRAINT chk_outsource_contracts_status CHECK (status IN ('draft', 'sent', 'accepted', 'declined', 'completed', 'cancelled'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE outsource_deliveries (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  contract_id VARCHAR(40)     NOT NULL,
  channel     VARCHAR(10)     NOT NULL,
  to_address  VARCHAR(254)    NOT NULL,
  at          BIGINT UNSIGNED NOT NULL,
  body        TEXT            NOT NULL,
  outbox_id   VARCHAR(40)     NULL,
  PRIMARY KEY (id),
  KEY idx_outsource_deliveries_contract_at (contract_id, at),
  KEY idx_outsource_deliveries_outbox (outbox_id),
  CONSTRAINT fk_outsource_deliveries_contract FOREIGN KEY (contract_id) REFERENCES outsource_contracts (id),
  CONSTRAINT fk_outsource_deliveries_outbox FOREIGN KEY (outbox_id) REFERENCES outbox (id) ON DELETE SET NULL,
  CONSTRAINT chk_outsource_deliveries_channel CHECK (channel IN ('email', 'sms'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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


CREATE TABLE counters (
  name  VARCHAR(40)  NOT NULL,
  value INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE login_attempts (
  scope        VARCHAR(20)     NOT NULL,
  identifier   VARCHAR(254)    NOT NULL,
  count        INT             NOT NULL DEFAULT 0,
  locked_until BIGINT UNSIGNED NULL,
  updated_at   BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (scope, identifier)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE auth_challenges (
  id         VARCHAR(40)     NOT NULL,
  purpose    VARCHAR(20)     NOT NULL,
  admin_id   VARCHAR(40)     NOT NULL,
  code_hash  VARCHAR(255)    NOT NULL,
  field      VARCHAR(10)     NULL,
  new_value  VARCHAR(254)    NULL,
  expires_at BIGINT UNSIGNED NOT NULL,
  resend_at  BIGINT UNSIGNED NOT NULL,
  attempts   INT             NOT NULL DEFAULT 0,
  used_at    BIGINT UNSIGNED NULL,
  created_at BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  KEY idx_auth_challenges_admin (admin_id),
  CONSTRAINT fk_auth_challenges_admin FOREIGN KEY (admin_id) REFERENCES admins (id),
  CONSTRAINT chk_auth_challenges_purpose CHECK (purpose IN ('sign_in', 'contact_change')),
  CONSTRAINT chk_auth_challenges_field CHECK (field IS NULL OR field IN ('email', 'mobile'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE password_resets (
  id          VARCHAR(40)     NOT NULL,
  customer_id VARCHAR(40)     NOT NULL,
  code_hash   VARCHAR(255)    NOT NULL,
  expires_at  BIGINT UNSIGNED NOT NULL,
  resend_at   BIGINT UNSIGNED NOT NULL,
  attempts    INT             NOT NULL DEFAULT 0,
  verified_at BIGINT UNSIGNED NULL,
  used_at     BIGINT UNSIGNED NULL,
  created_at  BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  KEY idx_password_resets_customer (customer_id),
  CONSTRAINT fk_password_resets_customer FOREIGN KEY (customer_id) REFERENCES customers (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE signup_requests (
  id            VARCHAR(40)     NOT NULL,
  email         VARCHAR(254)    NOT NULL,
  first_name    VARCHAR(60)     NOT NULL,
  middle_name   VARCHAR(60)     NOT NULL DEFAULT '',
  last_name     VARCHAR(60)     NOT NULL,
  mobile        VARCHAR(20)     NOT NULL,
  password_hash VARCHAR(255)    NULL,
  google_subject VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NULL,
  code_hash     VARCHAR(255)    NOT NULL,
  expires_at    BIGINT UNSIGNED NOT NULL,
  resend_at     BIGINT UNSIGNED NOT NULL,
  attempts      INT             NOT NULL DEFAULT 0,
  used_at       BIGINT UNSIGNED NULL,
  created_at    BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  KEY idx_signup_requests_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE password_changes (
  id                VARCHAR(40)     NOT NULL,
  customer_id       VARCHAR(40)     NOT NULL,
  new_password_hash VARCHAR(255)    NOT NULL,
  code_hash         VARCHAR(255)    NOT NULL,
  expires_at        BIGINT UNSIGNED NOT NULL,
  resend_at         BIGINT UNSIGNED NOT NULL,
  attempts          INT             NOT NULL DEFAULT 0,
  used_at           BIGINT UNSIGNED NULL,
  created_at        BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  KEY idx_password_changes_customer (customer_id),
  CONSTRAINT fk_password_changes_customer FOREIGN KEY (customer_id) REFERENCES customers (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE customer_email_changes (
  id          VARCHAR(40)     NOT NULL,
  customer_id VARCHAR(40)     NOT NULL,
  new_email   VARCHAR(254)    NOT NULL,
  code_hash   VARCHAR(255)    NOT NULL,
  expires_at  BIGINT UNSIGNED NOT NULL,
  resend_at   BIGINT UNSIGNED NOT NULL,
  attempts    INT             NOT NULL DEFAULT 0,
  used_at     BIGINT UNSIGNED NULL,
  created_at  BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  KEY idx_customer_email_changes_customer (customer_id),
  CONSTRAINT fk_customer_email_changes_customer FOREIGN KEY (customer_id) REFERENCES customers (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


INSERT INTO catalog_settings (id, price_per_plate, min_downpayment, updated_at) VALUES (1, 600, 3000, UNIX_TIMESTAMP() * 1000);

INSERT INTO calendar_settings (id, daily_capacity, updated_at) VALUES (1, 2, UNIX_TIMESTAMP() * 1000);

INSERT INTO counters (name, value) VALUES ('receipt', 0), ('payment', 0), ('inventory', 0), ('outsource', 0), ('refund', 0);
