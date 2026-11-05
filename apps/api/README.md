# Tres Marias API

The API uses Express and MySQL. Start it from the project root with `npm run dev:api`.

## Google sign-in verification

Every Google customer sign-in requires an emailed six-digit code. `POST /api/auth/customer/google`
returns `code_required` and challenge metadata for an existing customer, never a session. Complete it
with `POST /api/auth/customer/google/:id/verify` and `{ code }`; request another code with
`POST /api/auth/customer/google/:id/resend`. Both routes require an allowed customer origin and use
the authentication rate limiter. The server preserves the initial remember preference and current
account email, checks code and account lockouts, invalidates pending codes after email/password/Google
identity changes, and consumes each verified challenge in a transaction before issuing a session.

New Google customers return `email_required` after profile completion and use the existing signup
verify/resend routes, including Gmail addresses. No new account exists before the signup code is
verified. Run `npm run db:migrate` before starting this API version to create
`customer_google_signins` without changing existing customer rows. `npm run test:google` covers code
lifecycle and HTTP validation; `npm run test:google:db` checks local MySQL persistence and concurrent
single-use verification with test fixtures cleaned up afterward.

## Folder layout

- `src/`: runtime code and database seed data.
- `scripts/`: database setup, migration, seeding, route audits and email previews.
- `tests/`: automated checks; shared test helpers are in `tests/helpers/`.
- `uploads/`: files used by the application; preserve these together with the database.
- `tmp/`: generated previews and local seed backups; created by tools when needed.

## Verification

Run `npm test` from the project root to check API behavior, admin form logic and customer features. The default API suite uses fixtures or mocked database/storage access; it does not write to the configured MySQL database. Individual `test:*` commands remain available. Database integration checks and `test:security` are separate, explicit commands.

## Package and Budget Recommendation

The package builder produces complete private proposals for **Buffet and Catering** or **Catering only** from the customer's guests, budget, schedule and preferences. A named catalog package is not required. Equipment rental continues through the existing item/quantity booking flow. Approved recipe components may come from different published catalog packages; this is a personalized request, not an automatically published catalog package.

`GET /api/catalog` includes `packageProposalRules` and `packageProposalCatalogFingerprint`. Administrators use `GET /api/admin/package-proposal-rules` and `PUT /api/admin/package-proposal-rules` with `{ rules }`. New settings default to `{ enabled: false, recipes: [] }`. The admin recipe editor records a name/ID, service types, guest limits, source package/item position/name, explicit fixed or per-guests quantity rules, compatible optional-service IDs and an approved catering-only setup amount. Ingredient names or catalog prices never imply compatibility approval. Referenced source changes invalidate a recipe for fresh generation until an administrator reviews it.

Customer-authenticated endpoints:

- `POST /api/package-proposals` accepts `{ requestId, conversationId?, context, reviewedCatalogFingerprint }`. Context contains supported service, guests, whole-peso budget, event date/times, occasion/preferences, menu/styling requests and selected/protected services. Client-supplied amounts, package snapshots and approvals are rejected.
- `GET /api/package-proposals/:id` returns the owner's saved, unexpired options with calculated estimates, pending charges and `ready`, `no-options` or `unavailable` status.
- `POST /api/package-proposals/:id/select` accepts `{ revision, optionId }` and returns a checked reference and current option. Treat option IDs as opaque values; they may contain slashes and belong in the JSON body.
- `POST /api/assistant/conversations/:id/package-proposal-selection` accepts `{ revision, packageProposalRef }`; the outer revision is the conversation revision, while `packageProposalRef` is `{ proposalId, optionId, revision }`. Selection and saved draft update share a transaction.

Generation is limited to eight requests per minute per authenticated customer per API process. A unique customer/request UUID claims a generation before a paid model call; an unchanged retry returns its existing outcome. A changed body needs a new request UUID. Proposals expire 24 hours after creation. Generation refreshes current catalog, calendar and stock before ranking and again before saving. Selection and submission refresh them again. One generation uses the existing assistant allowance and global spend controls; a generation within an active assistant turn shares that turn's quota and spend context. No model call occurs when there are no valid candidates, and unavailable generation never substitutes a mock AI ranking.

The deterministic shared engine assembles and prices candidate recipes using `computeQuote`; The configured text model chooses up to three supplied option IDs. Food, required setup and guest count are not cut to force affordability. The engine may return honest above-budget or incomplete options when there is no verified fit. Unknown charges remain unpriced. Calendar results do not establish staffing or unmapped setup equipment availability and do not hold stock or slots.

An owner read of an already submitted proposal includes `submission: { reservationRef, submittedAt, packageProposalRef }` (otherwise `submission: null`). It is read-only recovery data, including after the proposal expires; the selection endpoint still rejects submitted proposals. The booking form checks this result before reselection so a committed request with a lost response can open its existing reservation. Newer or different manual work is preserved and receives an existing-request link. Proposal-card handoffs reconcile saved conversation event/venue/access answers with the latest manual draft as well as transferring owned photos.

The regular booking request accepts only `packageProposalRef`, never a caller-authored package snapshot. Inside the existing availability-locked reservation transaction, the backend resolves the owner-selected option, rechecks its revision/current rules/estimate and matches the reviewed service, guest count, schedule, menu, styling and services. Event name and venue details can be completed in the normal form. A custom reservation has `package_source = 'custom'`, a null catalog `package_id` and a versioned server-owned `package_snapshot`; the original budget request is stored separately. Proposal-to-reservation binding is atomic and retries return the saved reservation. Both chat and form submission require the customer's explicit consent.

Existing catalog reservations retain their catalog reference and historical pricing. Custom setup inclusions resolve from the original or sent-quotation snapshot in both portals and document views. Admin guest-count/service changes on a submitted custom setup require a newly reviewed proposal rather than silently creating unapproved equipment combinations. Ordinary working services, menu, venue and schedule remain subject to applicable validation and quotation revision controls.

Run the additive migration only when database work is authorized. It adds `catalog_settings.package_proposal_rules`, `package_proposals`, `reservations.package_source`, `reservations.package_snapshot` and explicitly permits null `reservations.package_id` while retaining its foreign key and existing values. Enable recipes through the admin editor after the migration and review the required setup/quantity/pricing approvals before live generation.

`npm run test:package-proposals` from the root runs the isolated engine, policy, backend and customer-draft regressions. `npm run test:package-proposals:db` is an explicit local-only rollback check of custom catering/buffet booking, ownership, stale references, immutable original snapshots, quotation revisions/acceptance and submitted recovery. `npm run test:package-proposals:ui` uses isolated customer/admin browser contexts and intercepted APIs, including disabled-AI planning, retired selections and stale custom-chat review. It requires Playwright and Chrome. Real provider quality, latency and usage evaluation remains a separate funded activity.

## Legacy budget adjustments (compatibility)

New event requests save an `inclusive-buffet-v2` pricing marker. For Buffet and Catering, `computeQuote` includes the selected standard setup and standard dining equipment for the full guest count in the configured per-person rate. It keeps the six-hour fee separate and retains operational item-count confirmation. Missing markers use `legacy-package-plus-buffet-v1`; previews and explicit re-quotations retain saved package prices, guest baselines, and per-person rates. No historical quotation is bulk-repriced.

`PUT /api/admin/addons/:id/budget-policy` accepts `{ budgetPolicy: { allowRemove, minQty, replacementIds, requires } }` for an active bookable service or child option. Null resets the permissions to disabled. Only administrators can write; normal catalog edits preserve policies. A blank/null minimum prevents quantity recommendations. Replacements and dependencies must reference distinct active bookable services; dependency cycles and incompatible package dependencies are rejected. Food cannot be adjusted. Administrators must approve actual business minimums and replacement suitability; no catalog records are automatically enabled.

`GET /api/catalog` includes per-leaf `budgetPolicy` data and a server-generated `budgetCatalogFingerprint` for detecting price, inclusion, and rule changes. The fingerprint never authorizes a client-supplied price. The shared budget engine uses canonical selections, approved policies, and catalog prices; unknown amounts stay incomplete. Actions apply atomically against current event facts, policies, selections, and known availability, preserving unrelated edits.

Run the additive `npm run db:migrate` before starting the changed API against an existing database. It adds `addons.budget_policy`, `reservations.budget_request`, and the owner/expiry-indexed `budget_proposals` table. Nullable fields leave existing rows unchanged. Proposal snapshots are stored by the budget endpoint. Submitted buffet budgets are stored in the nullable reservation JSON column; historical/no-budget reservations remain null.

`POST /api/budget-proposals` requires an authenticated customer and accepts only Buffet and Catering context: package ID, guests, event date/times, occasion, target budget, canonical service selection/quantities, selected protected IDs, preferences, and the current `reviewedCatalogFingerprint`. Request prices and arbitrary edits are rejected. The server reads current catalog/rules/stock, creates valid changes and computes all money before asking GPT-6 Luna to rank at most three candidate IDs. Canonical action descriptions and reason codes keep provider output from introducing prices or suitability claims. Responses include an estimate, candidates, fingerprints, and `ready`, `no-changes` or `unavailable` status. Catalog/availability races return safe 409 errors; the client requires an explicit fresh review.

Generation is limited to five requests per minute per authenticated customer. Identical in-flight contexts share one operation, and successful identical contexts use a customer/catalog/stock-scoped 60-second cache. These bounds are per API process. A successful proposal snapshot expires after 24 hours and is owner-scoped; it does not reserve availability. Empty candidate sets skip the provider. Disabled access, missing configuration, quota, refusal, invalid output, and timeouts leave normal manual editing/booking usable. Unavailable responses are not cached as successful proposals.

### Submitted budgets and admin service revisions

The existing JSON or multipart `POST /api/reservations` accepts optional `budgetRequest: { budget, preferences, protectedAddonIds, proposalId?, reviewedCatalogFingerprint }` only for Buffet and Catering. Prices, totals, original selections and history cannot be supplied in that object. The server validates the normal booking, current service quantities/dependencies/stock, and catalog fingerprint inside its reservation transaction. It builds an immutable snapshot of the submitted menu/inclusions, selected service names/quantities/prices, known estimate, pending-price list, budget, priorities and timestamps. If a proposal is linked, it must belong to the customer, be unexpired, and match the event and catalog; the baseline and change summary come from the server snapshot. This records service differences, including manual changes, without claiming every difference was chosen by AI.

Changed displayed pricing returns `CATALOG_CHANGED` (409); the client retains the draft, reloads the catalog and asks for review/resubmission. Expired/incompatible proposal links return `PROPOSAL_STALE` (409) with `allowManual`; the client removes the link and permits an explicit retry with the same selections/budget and no paid regeneration. No budget, no proposal, an incomplete estimate, and an above-budget request are all supported. Customer reads remain scoped to the owner; administrator reads expose the same saved snapshot. Later catalog/working edits never rewrite it.

`PUT /api/admin/reservations/:ref/addons` accepts strict `{ addonIds, addonQty }`. It is administrator-only and restricted to pending non-rental events, uses the availability lock and existing stock checks, validates mutually exclusive options/dependencies and quantities, and rejects reductions below already checked-out items. Food selections stay unchanged in this editor. Changes are logged in the existing activity timeline. An unquoted request gets a refreshed estimate; a quoted request keeps the sent amounts and requires revision when its selection differs. New quotations save selection and display-line snapshots. Older reliable saved quantities/totals are compared when available; an explicit revision marker handles an edited older quote with no reliable selection history. Customer acceptance rejects stale quotes.

Both portals distinguish the submitted request from current working services and show the final quote's difference from the requested budget. Quotation/contract previews use saved quote service lines and quantities even before an admin revision is sent. Existing email/outbox actions are reused. No new notification is delivered merely by editing a service selection.

### Budget AI configuration

Keep these settings on the API server, in `apps/api/.env` (see `.env.example`):

```dotenv
AI_BUDGET_ENABLED=false
OPENAI_API_KEY=
AI_TEXT_MODEL=gpt-6-luna
AI_BUDGET_MODEL=
AI_BUDGET_TIMEOUT_MS=20000
AI_BUDGET_MAX_OUTPUT_TOKENS=2000
```

Booking chat, package-proposal ranking and legacy budget recommendations default to `gpt-6-luna`. Set backend `AI_TEXT_MODEL=gpt-6.1-sol` to compare Sol later, then restart the API. Leave `AI_BUDGET_MODEL` blank to follow the shared model; an explicit legacy override must match `AI_TEXT_MODEL`. Unsupported models are rejected. Existing installations pinned to Sol must update or clear that legacy override when moving to Luna. Text spend reservations and settlements use the selected model's standard rates, rounded up to whole microdollars. Cached input is conservatively counted at the uncached rate; accounting is not an exact invoice. Voice transcription and spoken replies continue to use their separate audio models.

Add a private server key and, when the account has API credits and live calls are wanted, set `AI_BUDGET_ENABLED=true` and restart the API. Keep the flag false while preparing/testing offline. Never put the key in a `VITE_*` variable, browser storage, a customer request, or source control. The integration uses the official SDK's Responses API, strict Structured Outputs, low reasoning effort, `store: false`, no external tools, and zero automatic retries. A bounded timeout also aborts the request. Preferences and relevant service descriptions are sent as data; customer identities, contact details, addresses, photos and booking history are omitted. Logs include only request ID, configured model, duration, token totals and safe outcome codes.

From the project root, `npm run test:budget` runs isolated rule, pricing, schema, access, AI-adapter, cache and repository checks with injected provider/database fixtures. `npm test` also exercises customer draft and selection helpers. No OpenAI key, credits or paid request is needed for these suites. `npm run test:budget:db` requires a non-production loopback MySQL target; its fixtures roll back and delivery hooks are disabled. Real-provider quality/latency/usage evaluation is pending a funded API account and an agreed request cap.

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

## Guest and customer AI assistant

The landing-page assistant offers two completed guest questions across text and voice. Signed-in
customers receive a configurable daily allowance and can complete a guided reservation inside chat,
or carry reviewed selections into the booking form. The customer and administrator Messages
conversations remain separate from AI conversations.

Run `npm run db:migrate` before starting this version against an existing database. The five
`assistant_*` tables store temporary conversations, durable allowances, idempotent turn processing,
aggregate spending reservations and usage. The migration adds tables without resetting application data.
The conversation stores `booking_draft` (nullable JSON), `draft_revision` (unsigned integer, default
zero), `reference_photos` (nullable JSON) and `submitted_ref` (nullable VARCHAR). Re-run the additive
migration for an existing installation. The
plan is updated atomically with each completed AI turn and remains under the same ownership and
24-hour expiry. A draft edit/import uses the conversation revision and conflicts with an active turn
or stale revision, preventing concurrent tabs from overwriting newer answers.

Guided tools save explicit customer selections, expose missing fields and up to two focused follow-up
questions, compare current estimates with a supplied budget, and find up to three later calendar dates
within fourteen days or three nearest same-day times preserving event duration. The preferred date is
checked before times, then checked again with the exact range. Rental calendar checks exclude catering capacity/time conflicts;
equipment stock, staffing, delivery feasibility and final quotation still require the existing checks.
An incomplete motif, menu or plan can continue to customer review without being treated as submitted.
Saved answers and explicit optional-topic skips drive visual package/menu/theme/color/add-on/rental
controls. `planningStarted` begins the full interview; natural-language intent also starts it.

`POST /assistant/conversations/:id/booking-draft` validates a reviewed full draft with its `revision`.
`POST /assistant/conversations/:id/resume-booking` accepts a signed-in customer's saved form selection
and revision. Both enforce ownership before catalog access, accept no prices, approval or terms
authority, and do not charge an AI question. Uploaded photos, payment information and budget proposal
credentials are excluded from model-visible draft data. Draft expiry and guest-to-customer claim rules match the conversation.
The browser binds reviewed personal handoffs to the customer and lets an unowned guest handoff be
claimed once on authenticated use. Signed-in customers can also submit their reviewed request directly
from chat, after terms acceptance and explicit confirmation. The language model has no submit tool.

Additional conversation endpoints:

- `POST /assistant/session` accepts `fresh: true` to start another plan without resetting the allowance.
- `POST /assistant/conversations/:id/schedule-options` accepts `days` (1–14) and `weekendsOnly`;
  returns checked `dates` and `times` without selecting or reserving them.
- `POST /assistant/conversations/:id/reference-photos` accepts multipart `photos` and `revision`.
  Existing image-signature checks enforce up to five JPG/PNG/WebP files, 20 MB each. Photos are private
  stored attachments, never model inputs. `POST .../reference-photos/remove` accepts `index` and
  `revision`; `GET .../reference-photos/:photoIndex` checks current conversation ownership and expiry.
- `POST /assistant/conversations/:id/submit` accepts only `revision`, `agreeTerms: true` and
  `confirmSubmission: true`. It requires an authenticated customer. The backend maps the saved draft
  to the existing reservation service, rechecks calendar/stock/styling/menu/prices, and creates the
  pending request and records its reference in one MySQL transaction. Retries return the existing
  reference; stale or actively edited plans are rejected. Submitted conversations are read-only.

Conversation snapshots include current public `bookingCatalog`, `bookingSchedule`, `bookingEstimate`,
safe `referencePhotos` metadata and `submittedRef`. Photos and plan writes advance the same revision.
The activity actor is the customer, with a description recording that AI Assistant helped create the
request. Private photos transfer to the reservation; expiry removes unsubmitted attachments while
preserving reservation photos. Returning to the manual form downloads owned photos into the existing
account-scoped draft first. If photos exceed browser storage or the combined five-photo limit, or a
guest needs to sign in, navigation stops with an explanation and the chat attachments remain intact.

The assistant uses `gpt-6-luna` through Responses, `gpt-transcribe` for recorded questions, and
`gpt-realtime-2.1-mini` through a server-side Realtime WebSocket for spoken replies. The speech model
reads the supplied answer; only the text-model workflow receives the controlled business functions. No
provider key or direct provider session is supplied to the browser.

Configure `OPENAI_API_KEY`, `AI_ASSISTANT_ENABLED=true`, and positive daily/monthly budget values in
`apps/api/.env`. Enable `AI_ASSISTANT_VOICE_ENABLED=true` for recording and spoken replies. Both budget
settings use **US cents**: 100 means US$1. Choose limits appropriate to the pilot before enabling it.
The default zero budgets and disabled flags prevent paid calls. No mock response is used as a live answer.
Keep the budget-recommendation feature's existing settings separate.

Guest tokens are random browser-held bearer secrets; the database stores their SHA-256 hash. They
travel in `X-Assistant-Visitor`, never in URLs. Conversations expire 24 hours after creation; expired
records are inaccessible immediately and deleted in bounded cleanup batches on assistant session
startup. Recognized visitor allowances last 90 days and are independent of transcript expiry. Clearing
browser storage or using another browser can create another anonymous identity; request rate limits
and the global spending caps limit abuse. Signup claiming requires both the visitor token and the
authenticated customer session. Once claimed, anonymous access to that conversation ends.

The API reserves question slots under database row locks. Only completed answers consume questions;
retries of a completed request return its existing result. One processing slot per allowance prevents
concurrent tabs from exceeding the guest limit. A 120-second lease recovers interrupted workers.
Each guest may attempt at most four transcriptions; signed-in users have twice their daily question
limit. The microphone recorder emits validated mono PCM16 WAV, with a server-verified 30-second cap.
Each stored answer permits two speech generations, with five-minute bounded server caching and
browser replay. Audio generation cannot narrate arbitrary client-supplied text. No recording is
persisted to disk or the database. Playback cache buffers are temporary.

Paid requests reserve conservative cost ceilings before contacting OpenAI. Completed text-model calls use
reported input/output usage; transcription and speech use conservative ceilings. Uncertain failures
retain their spending reservation even though the customer question is refunded. Aggregate caps are
shared across processes through MySQL and use Asia/Manila day/month boundaries. These accounting
estimates are not an exact provider invoice; keep provider spend controls configured as well.
Conversation content is excluded from routine logs. Usage metadata becomes eligible for cleanup after 90 days.
Application expiry does not change OpenAI's own data retention settings; review those independently
before launch and update the business privacy notice for external AI processing.

Validation: `npm run test:assistant`, `npm run test:assistant:db` (local MySQL only, including real
reservation rollback and concurrent submission checks), and
`npm run test:assistant:ui` (isolated Playwright fixtures; set `PLAYWRIGHT_MODULE_PATH` if required).
The database test removes its UUID-scoped records. Browser checks cover desktop/mobile guest gates,
reloads, microphone/transcript review, signup continuation and preserved booking drafts.
The 48 synthetic scenarios in `tests/fixtures/assistant-evaluation.json` are a human-reviewed live
evaluation set, not training data. Run `npm run evaluate:assistant -- --allow-paid` only after explicitly
configuring paid access. Reports go to ignored `tmp/assistant-evaluation/`. Tool-coverage flags are
diagnostics; a business reviewer must assess correctness, relevance, Taglish and spoken pronunciation.

### Assistant business scope

Every chat answer passes a backend input gate before any answering model or booking tool runs.
Narrow local intent rules redirect clear entertainment requests, including "who are the avenger"
and "anong anime ang maganda kapag horror ang genre", without paid calls. Other messages use an
independent tool-free structured classifier with the current message, recent history and saved plan
as untrusted data. Valid event-theme inquiries and contextual short replies remain eligible;
standalone ambiguous requests ask for clarification. Business wording does not authorize unrelated
trivia, homework or entertainment recommendations.

The server accepts only the documented allowed/unrelated/mixed/unclear decisions. Mixed requests
must supply a nonempty verbatim business excerpt from the original message; answering receives
only that excerpt, with no prior chat history. Missing or fabricated excerpts, classifier errors,
refusals, malformed responses and oversized input return a fixed clarification instead of enabling
unrestricted answering. Spend-limit and abort errors still stop the turn.

A separate tool-free output check must approve the entire generated reply before it is saved.
Rejected replies return a server-owned redirect with empty cards and no bookingDraft, preserving
the saved draft and reference photos. Tool schemas, ownership checks, explicit proposal selection
and submission controls remain enforced by the server. Scope checks do not grant tool permissions
or undo valid tool-side proposal generation; rejected outputs do not display or select those proposals.
Voice playback uses the stored checked answer. Both guard calls use the existing model, spend
ledger, byte limits and abort signal, with at most 1,024 output tokens each. No new environment
variables, dependencies or database migrations are needed.

Scope checks are stored under the existing `assistant_usage.kind = 'answer'` category, like other
text answering work; `scope_input` and `scope_output` are not valid database enum values. The
transactional MySQL regression in `npm run test:assistant:db` exercises both guards and the answer
against the actual ledger, rolls back all test writes, and never contacts a model provider.

`npm run test:assistant` includes deterministic policy, provider and persistence regression tests.
These tests mock provider responses and make no live requests. They prove gate enforcement,
failure handling and state preservation, not perfect semantic classification. The paid human-review
set includes direct entertainment questions, valid styling themes, mixed requests and prompt
injection; run it only with explicit paid authorization. Model-based guards add latency/cost and
cannot guarantee zero bypasses.

## Reservation options

- Menu categories accept arrays of individual dish names, with at most two in each category and exactly four total. Existing text menus remain readable and editable as one choice per category.
- The existing menu JSON also stores `juice` and `dessert: { name, description }`. Desserts are booked through `add-dessert` and quoted as an ordinary additional charge; they are excluded from the four-dish count and buffet rate. Catering-only bookings can include dessert without buffet dishes.
- Both form and API use domain/menu.js validation. Customer/admin details and generated documents display the saved preferences.
- Themes suggest two color schemes. ROYGBIV family buttons expose shade choices; metallics remain available. Saved custom motif colors remain readable.
- Additional charge cards expand independently.

Before starting an updated API against an existing database, run `npm run catalog:update` (or `npm run catalog:update -- --live` for an explicitly authorized remote deployment). This idempotent catalog change adds the separately quoted Dessert charge and moves Kare-Kare to Pork, preserving dish IDs, booked menus and configured prices. It does not reset the database. Fresh seeds include these changes.

Verification: `npm run test:booking`, `npm run test:booking:db` against local MySQL, and `npm run build`. Database tests run the booking service in a transaction and roll back all fixtures, including chat and outbox records.

## AI usage protections and admin alerts

All paid text paths (assistant, complete package ranking and the legacy budget endpoint), transcription and speech reserve cost in the same MySQL day/month ledger before contacting OpenAI. Set positive `AI_ASSISTANT_DAILY_BUDGET_CENTS` and `AI_ASSISTANT_MONTHLY_BUDGET_CENTS` deliberately. Zero or disabled flags block live calls. These are conservative application estimates, not an exact provider invoice; cached input is counted at uncached rates, uncertain calls retain the reservation, and price changes or use of the same key outside this API require separate provider-side controls.

Each top-level request shares a processing ceiling of 250,000 microdollars (US$0.25). Chat permits at most nine provider reservations: six answering requests, two scope checks and one nested package rank. Other paths retain the seven-reservation default. Output limits are 2,048 tokens per answering call, 1,024 per scope check, 800 per package rank and 1,000 for legacy ranking. Chat retains bounded input and a shared 60-second turn deadline. All SDK automatic retries are zero. Equivalent repeated tool calls with unchanged draft state terminate the turn. Completed request IDs replay the stored result; legacy cache/in-flight reuse is customer/input/catalog/stock scoped for 60 seconds. No cross-customer answer or stale availability cache was added. Stable answer prompt prefixes/cache keys support provider prompt caching without extended retention.

Production routes add durable, atomic MySQL admission windows. Paid traffic is limited to 6 attempts/minute/account, 12/minute/IP subnet, 60/minute globally, 200/day/IP and six times the configured daily question allowance in daily attempts/account (12 for a guest IP identity). These attempts include rejected/failed/replayed HTTP calls, while completed-question allowance is charged only on success. Fresh guest sessions cannot reset the IP limits. Session creation has separate 8/minute/IP and 100/day/IP limits. Admission allows at most 3 concurrent paid requests globally and 1 per actor; leases expire after 120 seconds, covering an absolute 30-second body deadline plus bounded provider work. Persisted counters survive restarts and apply across API workers. If guard storage is unavailable, protected requests fail closed.

Five uncertain provider outcomes in a rolling five-minute window pause new paid requests until the window clears. Reference photos require a signed-in customer, query/body revision agreement, an editable catering plan and free gallery slots before multipart buffering. Uploads have 5/minute/customer and IP admission limits, 20/day/customer, 30/day/IP and 2 concurrent batches globally. File count is bounded to the remaining gallery slots; the existing 20 MB/file and five-photo product maximum remains. A slow body cannot continue into paid work after its admission deadline. Under the current live Nginx 21 MB request-body limit, a full five-file batch may need smaller files; Nginx may reject an oversized batch before the API. AI photos remain staff attachments, not model inputs.

`TRUST_PROXY` defaults to `loopback` for the existing local Nginx topology. Direct public clients cannot forge the app's IP by supplying `X-Forwarded-For`. Values of `true`, numeric hop counts, universal CIDRs or invalid networks are rejected; configure an explicit trusted network list if the deployment topology changes.

`GET /api/admin/ai-usage` requires admin authentication and exposes model/readiness, USD spending estimates, recent attempt/uncertain-outcome counts and active alerts, never API keys, prompts, customer text or raw IP addresses. Alerts cover 80% daily/monthly budget use, reached caps, uncertain provider outcomes, an open failure circuit and request spikes (40 attempts in five minutes). Alerts appear in the admin dashboard (manual refresh or every 60 seconds while visible), and are logged once per code/Manila day with a durable deduplication record. No email, paid model or external webhook is used for alerts. The monitor's `available` flag describes configuration readiness; active cap/circuit alerts show a paused state in the card. The read-only dashboard itself never calls OpenAI.

Apply `npm run db:migrate` before restarting this release; it additively creates `ai_guard_windows`, `ai_guard_leases` and `ai_usage_alerts`. Existing assistant/package tables must also be present. Never reset or seed production for an upgrade. Run `npm test`, `npm run test:ai-safety:db -w apps/api`, `npm run test:assistant:db` and `npm run test:package-proposals:db` against a non-production loopback database. Paid model accuracy/account-access testing remains separate and is not implied by fixture checks.

Startup rejects accidentally oversized settings above US$10/day or US$40/month. For the initial pilot, use smaller values such as 100 daily cents and 200 monthly cents. These configuration ceilings do not control other applications using the same OpenAI key. Live deployment keeps the key empty and enable flags/caps disabled until the operator supplies their ENV.
