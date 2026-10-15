import { z } from 'zod';

const text = (max) =>
  z
    .string({ error: 'This field is required.' })
    .max(max, { error: `Use ${max} characters or fewer.` })
    .default('');

const passThrough = z.unknown().optional();

export const idParams = z.object({ id: z.string() });
export const refParams = z.object({ ref: z.string() });

export const submitBody = z.object({
  ref: text(40),
  method: text(20),
  amount: passThrough,
  referenceNo: text(100),
  proofName: text(1000)
});

export const qrBody = z.object({ ref: text(40), amount: passThrough });

export const qrQuery = z.object({ image: z.enum(['0', '1']).optional() });

export const qrListQuery = z.object({ ref: z.string().max(40, { error: 'Use 40 characters or fewer.' }).optional() });

export const rejectBody = z.object({ reason: text(1000) });

export const cashBody = z.object({ amount: passThrough });

export const bankDetailsBody = z.object({
  bankName: passThrough,
  bankAccountName: passThrough,
  bankAccountNumber: passThrough
});

export const refundBody = z.object({
  amount: passThrough,
  method: text(20),
  referenceNo: text(100),
  sentOn: text(10),
  reason: text(1000)
});
