import { normaliseEmail } from '@tm/shared/src/domain/account.js';
import { validateAdminPassword, validateEmail, validatePassword } from '@tm/shared/src/utils/validation.js';

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

/**
 * The email the seeded admin account signs in with, from SEED_ADMIN_EMAIL in apps/api/.env. Its
 * sign-in codes go to this address. Blank means the owner's address in seedData/seed.js. The setting is
 * for a live site set up by someone who cannot open the owner's inbox yet. The account keeps the
 * owner's name and mobile, and the owner can switch the email back later on the admin's My Account page
 * (the code for that goes to the owner's address). Kept in .env, not in the code, so a
 * personal address never reaches the public repository.
 *
 * Returns { email, problem }: `email` is the address in lower case, or '' when the setting is blank.
 * `problem` is a plain-words message when the address is not valid, otherwise ''.
 */
export function seedAdminEmail() {
  const email = normaliseEmail(process.env.SEED_ADMIN_EMAIL);
  const problem = email && validateEmail(email) ? `SEED_ADMIN_EMAIL is not a valid email address. ${validateEmail(email)}` : '';
  return { email, problem };
}
