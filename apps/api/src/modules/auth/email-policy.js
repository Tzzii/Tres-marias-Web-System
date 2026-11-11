import { domainToASCII } from 'node:url';
import { disposableEmailBlocklistSet } from 'disposable-email-domains-js';
import { validateEmail } from '@tm/shared/src/utils/validation.js';
import { config } from '../../config.js';
import { ApiError } from '../../lib/ApiError.js';
import { createAbstractLookup } from '../../integrations/abstract.js';

// Keep the bundled list as the policy when the external check is unavailable.
const disposableDomains = disposableEmailBlocklistSet();
// Confirmed disposable providers missing from the bundled list.
const additionalDisposableDomains = new Set([
  'nbasweeps.com',
  ...String(process.env.DISPOSABLE_EMAIL_DOMAINS || '')
    .split(',')
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean)
]);

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
    if (disposableDomains.has(domain) || additionalDisposableDomains.has(domain)) {
      throw new ApiError(
        'INVALID',
        'Please use an email address you can keep accessing for your booking updates. Temporary email providers are not supported.',
        { field: 'email' }
      );
    }
    domain = domain.slice(domain.indexOf('.') + 1);
  }
}

export async function assertCustomerEmailAllowedWithDisify(email) {
  assertCustomerEmailAllowed(email);

  let response;
  let result;
  try {
    response = await fetch('https://disify.com/api/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(config.disifyApiKey && { 'X-Api-Key': config.disifyApiKey })
      },
      body: new URLSearchParams({ email: String(email).trim() }),
      redirect: 'error',
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) return;
    result = await response.json();
  } catch {
    return;
  }

  if (!result || typeof result !== 'object' || typeof result.format !== 'boolean') return;
  if (result.format === false) {
    throw new ApiError('INVALID', 'Enter a valid email address.', { field: 'email' });
  }
  if (result.blocked === true) {
    throw new ApiError('INVALID', 'Please use another email address.', { field: 'email' });
  }
  if (typeof result.disposable !== 'boolean') return;
  if (result.disposable) {
    throw new ApiError(
      'INVALID',
      'Please use an email address you can keep accessing for your booking updates. Temporary email providers are not supported.',
      { field: 'email' }
    );
  }
}

const checkEmail = createAbstractLookup({
  endpoint: 'https://emailreputation.abstractapi.com/v1/',
  parameter: 'email',
  apiKey: () => config.abstractEmailApiKey,
  readVerdict: (result, address) => {
    if (typeof result?.email_address !== 'string' || result.email_address.trim().toLowerCase() !== address.toLowerCase()) return;
    const status = result.email_deliverability?.status;
    if (status === 'deliverable') return true;
    if (status === 'undeliverable') return false;
  }
});

export async function assertCustomerEmailAllowedWithAbstract(email) {
  assertCustomerEmailAllowed(email);
  const address = String(email).trim();
  if ((await checkEmail(address)) === false) {
    throw new ApiError('INVALID', 'This address cannot receive email right now. Check the address or use another email.', {
      field: 'email'
    });
  }
}

export async function assertCustomerEmailAllowedWithProviders(email) {
  await assertCustomerEmailAllowedWithDisify(email);
  await assertCustomerEmailAllowedWithAbstract(email);
}
