import { validateAdminPassword, validatePassword } from '@tm/shared/src/utils/validation.js';

/**
 * The passwords the seeder gives the accounts it creates, read from apps/api/.env (Phase 12): never
 * from the code or the README, because the repository is public and the first admin password of the
 * live server must not be known to anyone who reads it.
 *   SEED_ADMIN_PASSWORD     the owner's admin account (seed:api and seed:starter); admin password rules
 *   SEED_CUSTOMER_PASSWORD  every sample customer (seed:api only); customer password rules
 * Import config.js before this file: it loads .env into process.env. Values are not trimmed (a
 * password may end in a space) and are never printed.
 *
 * Returns { admin, customer, problems }: `problems` lists, in plain words, what is missing or too weak,
 * and is empty when the seed may go ahead. `customers` says whether the sample customers are seeded.
 */
export function seedPasswords({ customers }) {
  const admin = process.env.SEED_ADMIN_PASSWORD || '';
  const customer = process.env.SEED_CUSTOMER_PASSWORD || '';
  const problems = [];
  if (!admin) problems.push('SEED_ADMIN_PASSWORD is not set in apps/api/.env: it is the password of the admin account the seed creates.');
  else if (validateAdminPassword(admin)) problems.push(`SEED_ADMIN_PASSWORD is too weak. ${validateAdminPassword(admin)}`);
  if (customers) {
    if (!customer) problems.push('SEED_CUSTOMER_PASSWORD is not set in apps/api/.env: it is the password of every sample customer.');
    else if (validatePassword(customer)) problems.push(`SEED_CUSTOMER_PASSWORD is too weak. ${validatePassword(customer)}`);
  }
  return { admin, customer, problems };
}
