import jwt from 'jsonwebtoken';

/** Purpose-separated proof returned only after the reset code was checked. */
export function issueResetProof(reset, verifiedAt, secret, validMinutes) {
  return jwt.sign(
    { kind: 'customer-password-reset', id: reset.id, hash: reset.codeHash, verifiedAt },
    `${secret}:customer-password-reset`,
    { algorithm: 'HS256', expiresIn: `${validMinutes}m` }
  );
}

export function hasResetProof(token, reset, secret) {
  try {
    const proof = jwt.verify(token, `${secret}:customer-password-reset`, { algorithms: ['HS256'] });
    return (
      proof.kind === 'customer-password-reset' &&
      proof.id === reset.id &&
      proof.hash === reset.codeHash &&
      proof.verifiedAt === reset.verifiedAt &&
      !reset.usedAt &&
      reset.expiresAt > Date.now()
    );
  } catch {
    return false;
  }
}
