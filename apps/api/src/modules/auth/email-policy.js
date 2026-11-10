import { domainToASCII } from 'node:url';
import { disposableEmailBlocklistSet } from 'disposable-email-domains-js';
import { validateEmail } from '@tm/shared/src/utils/validation.js';
import { ApiError } from '../../lib/ApiError.js';

// The list is bundled with the API. Signup never sends customer addresses to a third party.
const disposableDomains = disposableEmailBlocklistSet();

export function assertCustomerEmailAllowed(email) {
  const address = String(email || '').trim();
  const problem = validateEmail(address);
  if (problem) throw new ApiError('INVALID', problem, { field: 'email' });
  let domain = domainToASCII(address.slice(address.lastIndexOf('@') + 1))
    .toLowerCase()
    .replace(/\.$/, '');
  if (!domain) throw new ApiError('INVALID', 'Enter a valid email address.', { field: 'email' });
  // Provider subdomains inherit the same policy as the listed parent domain.
  while (domain.includes('.')) {
    if (disposableDomains.has(domain)) {
      throw new ApiError(
        'INVALID',
        'Please use an email address you can keep accessing for your booking updates. Temporary email providers are not supported.',
        { field: 'email' }
      );
    }
    domain = domain.slice(domain.indexOf('.') + 1);
  }
}
