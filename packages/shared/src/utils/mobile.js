import { parsePhoneNumberFromString } from 'libphonenumber-js/mobile';

/** Ignore common visual separators, but keep letters, punctuation and every extra digit for validation. */
export const compactMobile = (value = '') => String(value ?? '').replace(/[\s-]/g, '');

/** Remove one recognized PH prefix for the fixed +63 input, including partially typed numbers. */
export const nationalMobile = (value = '') => {
  const compact = compactMobile(value);
  if (compact.startsWith('+63')) return compact.slice(3);
  if (compact.startsWith('63') && compact.length > 10) return compact.slice(2);
  if (compact.startsWith('0')) return compact.slice(1);
  return compact;
};

/** A field change in domestic form, without truncating or silently repairing invalid input. */
export const mobileInputValue = (value) => {
  const national = nationalMobile(value);
  return national && /^\d+$/.test(national) ? `0${national}` : national;
};

/** Strict PH mobile format and allocated mobile ranges; this does not verify SIM activity/ownership. */
export const readPhilippineMobile = (value) => {
  const compact = compactMobile(value);
  // Check the entire input before parsing: parsers can otherwise extract a number from surrounding text.
  if (!/^(?:\+63|63|0)?[89]\d{9}$/.test(compact)) return null;
  const national = nationalMobile(compact);
  const phone = parsePhoneNumberFromString(`+63${national}`, { extract: false });
  return phone?.country === 'PH' && phone.isValid() && phone.getType() === 'MOBILE' ? phone : null;
};

/** Valid equivalents save consistently as 0XXXXXXXXXX; invalid input stays invalid. */
export const storedMobile = (value) => {
  const phone = readPhilippineMobile(value);
  return phone ? `0${phone.nationalNumber}` : compactMobile(value);
};
