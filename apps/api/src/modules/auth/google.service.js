import { TERMS_VERSION } from '@tm/shared/src/legal/terms.js';
import { cleanMobile, cleanName, fullNameProblem } from '@tm/shared/src/domain/account.js';
import { validateMobile } from '@tm/shared/src/utils/validation.js';
import { ApiError } from '../../lib/ApiError.js';

function completeProfile(profile) {
  const names = {};
  for (const field of ['firstName', 'middleName', 'lastName']) {
    names[field] = cleanName(profile[field]);
    if ((field !== 'middleName' && !names[field]) || names[field].length > 60)
      throw new ApiError('INVALID', 'Enter your first and last name (up to 60 characters each).', { field });
  }
  const name = Object.values(names).filter(Boolean).join(' ');
  if (fullNameProblem(name, 200)) throw new ApiError('INVALID', fullNameProblem(name, 200), { field: 'firstName' });
  const mobileError = validateMobile(profile.mobile);
  if (mobileError) throw new ApiError('INVALID', mobileError, { field: 'mobile' });
  if (profile.agreeTerms !== true || profile.termsVersion !== TERMS_VERSION)
    throw new ApiError('INVALID', 'Read and accept the current Terms of Service and Privacy Policy.', {
      field: 'agreeTerms'
    });
  return { ...names, name, mobile: cleanMobile(profile.mobile) };
}

export function createGoogleCustomerService({
  verify,
  repo,
  transaction,
  startSignInCode,
  checkPassword,
  assertNotLocked,
  reserveAttempt,
  wrongAnswer,
  startEmailSignup
}) {
  const changed = () => new ApiError('INVALID_STATE', 'Your account changed. Please start Google sign-in again.');
  return {
    async signIn({ credential, challenge, profile, password, remember = false }) {
      const identity = await verify({ credential, challenge });
      const linked = await repo.findGoogleCustomer(identity.sub);
      if (linked) {
        await assertNotLocked('customer', linked.email);
        return { status: 'code_required', ...(await startSignInCode(linked, remember, identity.sub)) };
      }
      const existing = await repo.findCustomerByEmail(identity.email);
      if (existing) {
        await assertNotLocked('customer', existing.email);
        if (!password) return { status: 'link_required', email: identity.email };
        const attempt = await reserveAttempt('customer', existing.email);
        if (!(await checkPassword(password, existing.passwordHash)))
          throw wrongAnswer(
            'customer',
            attempt,
            new ApiError('INVALID_CREDENTIALS', 'The existing account password is incorrect.', { field: 'password' })
          );
        let customer;
        try {
          customer = await transaction(async (conn) => {
            const current = await repo.findCustomerForUpdate(existing.id, conn);
            if (!current || current.passwordHash !== existing.passwordHash || current.email !== identity.email)
              throw changed();
            await repo.linkGoogle(identity.sub, current.id, conn);
            return current;
          });
        } catch (error) {
          if (error.code === 'ER_DUP_ENTRY') throw changed();
          throw error;
        }
        return { status: 'code_required', ...(await startSignInCode(customer, remember, identity.sub)) };
      }
      if (!profile)
        return {
          status: 'profile_required',
          profile: {
            firstName: identity.firstName,
            lastName: identity.lastName,
            email: identity.email
          }
        };
      const clean = completeProfile(profile);
      return { status: 'email_required', ...(await startEmailSignup(identity, clean)) };
    }
  };
}
