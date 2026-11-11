import { readPhilippineMobile } from '@tm/shared/src/utils/mobile.js';
import { validateMobile } from '@tm/shared/src/utils/validation.js';
import { config } from '../../config.js';
import { createAbstractLookup } from '../../integrations/abstract.js';
import { ApiError } from '../../lib/ApiError.js';

const checkPhone = createAbstractLookup({
  endpoint: 'https://phoneintelligence.abstractapi.com/v1/',
  parameter: 'phone',
  apiKey: () => config.abstractPhoneApiKey,
  readVerdict: (result, number) => {
    if (typeof result?.phone_number !== 'string') return;
    const returned = result.phone_number.trim();
    // Abstract returns an international number with or without the leading +.
    if (returned !== number && `+${returned}` !== number) return;
    return result.phone_validation?.is_valid;
  }
});

export async function assertCustomerMobileAllowedWithAbstract(mobile, field = 'mobile') {
  const problem = validateMobile(mobile);
  if (problem) throw new ApiError('INVALID', problem, { field });
  const number = readPhilippineMobile(mobile).number;
  if ((await checkPhone(number)) === false) {
    throw new ApiError('INVALID', 'This mobile number could not be validated. Check the number or use another Philippine mobile number.', {
      field
    });
  }
}
