import { RULES } from '@tm/shared/src/services/config.js';
import { maskEmail } from '@tm/shared/src/utils/format.js';
import { tx } from '../../db.js';
import { ApiError } from '../../lib/ApiError.js';
import { newId } from '../../lib/ids.js';
import { checkSecret, hashSecret, newCode } from '../../lib/passwords.js';
import { now } from '../../lib/time.js';
import { customerSession } from './auth.service.js';
import { sendCustomerSignInCode } from './auth.messages.js';
import * as googleRepo from './google.repo.js';
import { assertNotLocked, clearAttempts, reserveAttempt, wrongAnswer } from './lockout.js';

const REQUEST_LIFETIME = 30 * 60000;
const codeTimes = (at) => ({
  expiresAt: at + RULES.codeValidMinutes * 60000,
  resendAt: at + RULES.codeResendSeconds * 1000
});
const expired = () => new ApiError('CHALLENGE_EXPIRED', 'Your Google sign-in request expired. Please start again.');
const publicChallenge = (request) => ({
  challengeId: request.id,
  maskedEmail: maskEmail(request.email),
  expiresAt: request.expiresAt,
  resendAt: request.resendAt
});

export function createGoogleSignInCodeService({
  repo = googleRepo,
  transaction = tx,
  session = customerSession,
  sendCode = sendCustomerSignInCode,
  hashSecret: hash = hashSecret,
  checkSecret: check = checkSecret,
  newCode: generateCode = newCode,
  newId: generateId = newId,
  now: clock = now,
  assertNotLocked: assertUnlocked = assertNotLocked,
  reserveAttempt: reserve = reserveAttempt,
  clearAttempts: clear = clearAttempts,
  wrongAnswer: wrong = wrongAnswer
} = {}) {
  function assertLive(request, at = clock()) {
    if (!request || request.usedAt || request.createdAt + REQUEST_LIFETIME <= at) throw expired();
  }

  async function currentCustomer(request, conn, lock = false) {
    if (lock) await repo.findCustomerForUpdate(request.customerId, conn);
    const customer = await repo.findGoogleCustomer(request.googleSubject, conn);
    if (
      !customer ||
      customer.id !== request.customerId ||
      customer.email !== request.email ||
      (customer.passwordChangedAt ?? null) !== request.passwordChangedAt
    )
      throw expired();
    return customer;
  }

  async function assertAccountUnlocked(email) {
    await assertUnlocked('customer', email);
    await assertUnlocked('google-code', email);
  }

  return {
    async start(customer, remember = false, googleSubject) {
      await assertAccountUnlocked(customer.email);
      await reserve('code-email', customer.email);
      const code = generateCode(RULES.codeLength);
      const at = clock();
      const request = {
        id: generateId('gsi'),
        customerId: customer.id,
        email: customer.email,
        googleSubject,
        passwordChangedAt: customer.passwordChangedAt ?? null,
        remember,
        codeHash: await hash(code),
        ...codeTimes(at),
        createdAt: at
      };
      await repo.insertSignInChallenge(request);
      try {
        await sendCode(customer, code, request.id);
      } catch (error) {
        await repo.deleteSignInChallenge(request.id);
        throw error;
      }
      return publicChallenge(request);
    },

    async resend(challengeId) {
      const request = await repo.findSignInChallenge(challengeId);
      assertLive(request);
      await assertAccountUnlocked(request.email);
      if (request.resendAt > clock()) throw new ApiError('TOO_SOON', 'Please wait before requesting another code.');
      await currentCustomer(request);
      await reserve('code-email', request.email);
      const code = generateCode(RULES.codeLength);
      const codeHash = await hash(code);
      const { customer, times } = await transaction(async (conn) => {
        const current = await repo.findSignInChallengeForUpdate(challengeId, conn);
        const at = clock();
        assertLive(current, at);
        if (current.resendAt > at) throw new ApiError('TOO_SOON', 'Please wait before requesting another code.');
        const customer = await currentCustomer(current, conn, true);
        const times = codeTimes(at);
        await repo.replaceSignInCode(challengeId, { codeHash, ...times }, conn);
        return { customer, times };
      });
      try {
        await sendCode(customer, code, challengeId);
      } catch (error) {
        await repo.setSignInResendAt(challengeId, clock(), codeHash);
        throw error;
      }
      return times;
    },

    async verify({ challengeId, code }) {
      const request = await repo.findSignInChallenge(challengeId);
      assertLive(request);
      await assertAccountUnlocked(request.email);
      await currentCustomer(request);
      if (request.expiresAt <= clock()) throw new ApiError('CODE_EXPIRED', 'This code has expired. Request a new one.');
      const attempt = await reserve('google-code', request.email);
      if (!(await check(code, request.codeHash)))
        throw wrong('google-code', attempt, new ApiError('INVALID_CODE', 'That code is incorrect.'));

      const customer = await transaction(async (conn) => {
        const current = await repo.findSignInChallengeForUpdate(challengeId, conn);
        const at = clock();
        assertLive(current, at);
        if (current.codeHash !== request.codeHash) throw expired();
        if (current.expiresAt <= at) throw new ApiError('CODE_EXPIRED', 'This code has expired. Request a new one.');
        const customer = await currentCustomer(current, conn, true);
        if (!(await repo.markSignInUsed(conn, challengeId, at))) throw expired();
        return customer;
      });
      await clear('google-code', request.email);
      await clear('customer', request.email);
      await clear('code-email', request.email);
      return session(customer, request.remember);
    }
  };
}
