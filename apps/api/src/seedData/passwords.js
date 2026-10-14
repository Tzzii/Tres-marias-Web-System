import { normaliseEmail } from '@tm/shared/src/domain/account.js';
import { validateAdminPassword, validateEmail, validatePassword } from '@tm/shared/src/utils/validation.js';

export function seedPasswords({ customers }) {
  const admin = process.env.SEED_ADMIN_PASSWORD || '';
  const customer = process.env.SEED_CUSTOMER_PASSWORD || '';
  const problems = [];
  if (!admin)
    problems.push(
      'SEED_ADMIN_PASSWORD is not set in apps/api/.env: it is the password of the admin account the seed creates.'
    );
  else if (validateAdminPassword(admin))
    problems.push(`SEED_ADMIN_PASSWORD is too weak. ${validateAdminPassword(admin)}`);
  if (customers) {
    if (!customer)
      problems.push('SEED_CUSTOMER_PASSWORD is not set in apps/api/.env: it is the password of every sample customer.');
    else if (validatePassword(customer))
      problems.push(`SEED_CUSTOMER_PASSWORD is too weak. ${validatePassword(customer)}`);
  }
  return { admin, customer, problems };
}

export function seedAdminEmail() {
  const email = normaliseEmail(process.env.SEED_ADMIN_EMAIL);
  const problem =
    email && validateEmail(email) ? `SEED_ADMIN_EMAIL is not a valid email address. ${validateEmail(email)}` : '';
  return { email, problem };
}
