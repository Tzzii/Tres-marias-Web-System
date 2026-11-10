import { config } from '../../config.js';
import { ApiError } from '../../lib/ApiError.js';

const invalid = () =>
  new ApiError('INVALID', 'Please complete the security check and try again.', { field: 'captcha' });

export async function verifySignupCaptcha(req, res, next) {
  if (!config.turnstileSecret) {
    if (config.isProduction)
      throw new ApiError('DELIVERY_FAILED', 'The security check is unavailable. Please try again.');
    return next();
  }
  const token = req.valid?.body?.captchaToken;
  if (!token) throw invalid();

  let answer;
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: config.turnstileSecret, response: token, remoteip: req.ip }),
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) throw new Error('Turnstile verification unavailable');
    answer = await response.json();
  } catch {
    throw new ApiError('DELIVERY_FAILED', 'The security check is unavailable. Please try again.');
  }

  const allowedHostnames = config.corsOrigins.map((origin) => new URL(origin).hostname);
  const hostnameMatches = !config.isProduction || allowedHostnames.includes(answer.hostname);
  if (answer.success !== true || !hostnameMatches) throw invalid();
  next();
}

export const verifyGoogleSignupCaptcha = (req, res, next) =>
  req.valid.body.profile ? verifySignupCaptcha(req, res, next) : next();
