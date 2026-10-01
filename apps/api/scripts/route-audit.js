import fs from 'node:fs';
import path from 'node:path';
import {
  API_DIR,
  REPO_DIR,
  adminAccount,
  cell,
  client,
  closePool,
  config,
  createTestCustomer,
  nextIp,
  parseArgs,
  requireWriteConsent,
  stampNow,
  startApi,
  tokenFor,
  writeFile
} from './lib/harness.js';

/**
 * `npm run audit:routes -- --writes-test-data` — the route audit of Phase 12 (docs §8, Phase 12 #1).
 *
 * Every route of the API is called three times: with no token, with a customer's token and with the
 * admin's token, and each answer is checked against who may use that route:
 *   P  public            everyone gets past the guard (the answer may still be 400 or 404 for the test's
 *                        made-up input: only 401/403 count as "refused")
 *   C  customer only     no token -> 401, the customer gets through, the admin -> 403
 *   U  any signed-in     no token -> 401, the customer and the admin get through
 *   A  admin only        no token -> 401, the customer -> 403, the admin gets through
 *   W  PayMongo webhook  without a valid Paymongo-Signature everyone gets 401, token or not
 * "Gets through" also means the route exists: Express's own "Not found." 404 is a failure.
 *
 * The routes are not typed in here, they are read from the code: every `xxxRoutes.get|post|…('path'`
 * in src/modules/<module>/<module>.routes.js, and where app.js mounts each router (app.use / admin.use), so a route
 * added later is audited too. Who may use each router is written down below (ACCESS) as the intended
 * policy, the endpoint map of docs §9: a router missing from it stops the audit, so every new router
 * needs a deliberate decision. Path parameters get a made-up value and writes an empty body, so a call
 * that gets through is refused by the route's own checks (400/404) and changes nothing, with one
 * exception: "mark all reviews read" has nothing to refuse.
 *
 * Runs its own API process (development mode, the database in apps/api/.env) unless --base points at a
 * running one, e.g. --base https://api.tresmarias.ph/api on the live server in Phase 13: the tokens are
 * signed with this machine's JWT_SECRET, so run it where the server's .env is. Writes a test customer, so
 * it needs --writes-test-data. The report goes to docs/route-audit.md (or --out <file>).
 */

// Who may use each router: the access column of docs §9 (P public, C customer, U any signed-in, A admin)
const ACCESS = {
  authRoutes: 'P',
  catalogRoutes: 'P',
  calendarRoutes: 'P',
  feedbackPublishedRoutes: 'P',
  customerAccountRoutes: 'C',
  reservationRoutes: 'C',
  threadRoutes: 'C',
  paymentRoutes: 'C',
  refundRoutes: 'C',
  feedbackRoutes: 'C',
  rentalRoutes: 'U',
  changesRoutes: 'U',
  adminAccountRoutes: 'A',
  catalogAdminRoutes: 'A',
  calendarAdminRoutes: 'A',
  reservationAdminRoutes: 'A',
  paymentReservationRoutes: 'A',
  paymentAdminRoutes: 'A',
  balanceAdminRoutes: 'A',
  refundAdminRoutes: 'A',
  threadAdminRoutes: 'A',
  customerAdminRoutes: 'A',
  feedbackAdminRoutes: 'A',
  inventoryAdminRoutes: 'A',
  outsourceAdminRoutes: 'A',
  reportAdminRoutes: 'A'
};

// Routes app.js defines itself, outside the module routers
const APP_ROUTES = [
  { method: 'GET', path: '/health', access: 'P', router: 'app.js' },
  { method: 'POST', path: '/webhooks/paymongo', access: 'W', router: 'app.js' }
];

const LEGEND = { P: 'public', C: 'customer only', U: 'any signed-in user', A: 'admin only', W: 'PayMongo signature' };

/** Where app.js mounts each router, as paths under /api: { routerName: prefix }. */
function mountsFromApp() {
  const source = fs.readFileSync(path.join(API_DIR, 'src', 'app.js'), 'utf8');
  const mounts = {};
  for (const [, prefix, router] of source.matchAll(/app\.use\('\/api([^']*)',[^;]*?\b(\w+Routes)\);/g)) mounts[router] = prefix;
  for (const [, sub = '', router] of source.matchAll(/admin\.use\((?:'([^']*)',\s*)?(\w+Routes)\);/g)) mounts[router] = `/admin${sub}`;
  return mounts;
}

/** Every route of the module routers: [{ method, path (under /api), access, router, file }]. */
function routesFromModules() {
  const mounts = mountsFromApp();
  const routes = [];
  const modules = path.join(API_DIR, 'src', 'modules');
  for (const dir of fs.readdirSync(modules)) {
    for (const file of fs.readdirSync(path.join(modules, dir)).filter((name) => name.endsWith('.routes.js'))) {
      const source = fs.readFileSync(path.join(modules, dir, file), 'utf8');
      for (const [, router] of source.matchAll(/export const (\w+) = express\.Router\(\)/g)) {
        if (!(router in ACCESS)) throw new Error(`${dir}/${file}: router ${router} has no access in ACCESS (scripts/route-audit.js). Decide who may use it, then add it.`);
        if (!(router in mounts)) throw new Error(`${dir}/${file}: router ${router} is not mounted in app.js (or app.js mounts it in a way this script does not read).`);
      }
      for (const [, router, method, routePath] of source.matchAll(/(\w+Routes)\.(get|post|put|patch|delete)\(\s*'([^']+)'/g)) {
        const full = `${mounts[router]}${routePath === '/' ? '' : routePath}` || '/';
        routes.push({ method: method.toUpperCase(), path: full, access: ACCESS[router], router, file: `${dir}/${file}` });
      }
    }
  }
  return routes;
}

// A route path with made-up values for its parameters, e.g. /admin/reservations/:ref/approve -> …/audit-x/approve
const concrete = (routePath) => routePath.replace(/:\w+/g, 'audit-x');

const refused = (status) => status === 401 || status === 403;
// Got past the guard to a route that exists (Express's own 404 says exactly "Not found.")
const reached = (answer) => !refused(answer.status) && !(answer.status === 404 && answer.message === 'Not found.');

/** True when the three answers are what the route's access allows. */
function asExpected(access, { anon, customer, admin }) {
  if (access === 'P') return reached(anon) && reached(customer) && reached(admin);
  if (access === 'C') return anon.status === 401 && reached(customer) && admin.status === 403;
  if (access === 'U') return anon.status === 401 && reached(customer) && reached(admin);
  if (access === 'A') return anon.status === 401 && customer.status === 403 && reached(admin);
  if (access === 'W') return [anon, customer, admin].every((answer) => answer.status === 401);
  return false;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: npm run audit:routes -- --writes-test-data [--base <api url>] [--out <file>]');
    return 0;
  }
  requireWriteConsent(args, 'The route audit');
  const routes = [...APP_ROUTES, ...routesFromModules()];
  const own = args.base ? null : await startApi({ label: 'route-audit-api', env: { NODE_ENV: 'development' } });
  const base = args.base || own.base;
  const call = client(base);
  console.log(`Route audit of ${routes.length} routes against ${base}${own ? ` (its own API process; log: ${own.logFile})` : ''}...`);

  try {
    const admin = await adminAccount();
    const customer = await createTestCustomer('Audit');
    const tokens = { anon: null, customer: tokenFor(customer, 'customer'), admin: tokenFor(admin, 'admin') };
    const rows = [];
    for (const route of routes) {
      const answers = {};
      for (const [who, token] of Object.entries(tokens)) {
        // No token: a made-up client address per call, so the 100-a-minute limit per address is not what
        // answers. Against --base the real address counts: pace the calls instead.
        if (args.base && who === 'anon') await wait(650);
        const body = ['POST', 'PUT', 'PATCH'].includes(route.method) ? {} : undefined;
        const res = await call(route.method, concrete(route.path), { token, body, ip: args.base ? undefined : nextIp() });
        answers[who] = { status: res.status, message: res.body && res.body.message };
      }
      const ok = asExpected(route.access, answers);
      rows.push({ ...route, ...answers, ok });
      if (!ok) console.log(`  NOT AS EXPECTED: ${route.method} /api${route.path} (${route.access}) -> ${answers.anon.status} / ${answers.customer.status} / ${answers.admin.status}`);
    }

    const passed = rows.filter((row) => row.ok).length;
    const byAccess = Object.keys(LEGEND).map((access) => `${rows.filter((row) => row.access === access).length} ${LEGEND[access]}`).join(', ');
    const lines = [
      '# Route audit — Tres Marias API',
      '',
      `Generated by \`npm run audit:routes\` (apps/api/scripts/route-audit.js) on ${stampNow()} (Manila), against \`${base}\`` +
        (own ? ` (the script's own API process, development mode, database "${config.db.database}" on ${config.db.host}:${config.db.port}).` : '.'),
      '',
      `**Result: ${passed} of ${rows.length} routes answer as their access allows${passed === rows.length ? ' ✅' : ' ❌'}** (${byAccess}).`,
      '',
      'Every route is called three times — with no token, with a customer\'s token and with the admin\'s token — and the',
      'three status codes are checked against who may use it. The routes are read from the code (every router in',
      '`src/modules/*/*.routes.js` and where `app.js` mounts it), so a new route is audited automatically; who may use',
      'each router is the policy of the endpoint map (docs §9), written in the script.',
      '',
      '| Access | No token | Customer token | Admin token |',
      '|---|---|---|---|',
      '| **P** public | gets through | gets through | gets through |',
      '| **C** customer only | 401 | gets through | 403 |',
      '| **U** any signed-in user | 401 | gets through | gets through |',
      '| **A** admin only | 401 | 403 | gets through |',
      '| **W** PayMongo webhook | 401 | 401 | 401 (the signature is the guard, not a token) |',
      '',
      '"Gets through" means the guard let the request in: the route then answered with its own checks, usually 400',
      '(the test sends an empty body) or 404 (made-up ids), never 401 or 403, and never Express\'s "Not found." for a',
      'route that does not exist. Admin routes refuse an unknown address too, so a mistyped admin path can never be',
      'reached without the admin\'s token.',
      '',
      '| # | Method | Path | Access | No token | Customer | Admin | As expected |',
      '|---:|---|---|:---:|:---:|:---:|:---:|:---:|',
      ...rows.map((row, i) => `| ${i + 1} | ${row.method} | \`/api${cell(row.path)}\` | ${row.access} | ${row.anon.status} | ${row.customer.status} | ${row.admin.status} | ${row.ok ? '✅' : '❌'} |`),
      ''
    ];
    const out = args.out ? path.resolve(args.out) : path.join(REPO_DIR, 'docs', 'route-audit.md');
    writeFile(out, lines.join('\n'));
    console.log(`${passed} of ${rows.length} routes as expected (${byAccess}). Report: ${out}`);
    return passed === rows.length ? 0 : 1;
  } finally {
    if (own) await own.stop();
    await closePool().catch(() => {});
  }
}

process.exitCode = await main();
