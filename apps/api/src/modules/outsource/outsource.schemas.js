import { z } from 'zod';


const text = (max) =>
  z
    .string({ error: 'This field is required.' })
    .max(max, { error: `Use ${max} characters or fewer.` })
    .default('');

const passThrough = z.unknown().optional();

const querySwitch = z
  .unknown()
  .optional()
  .transform((value) => value === 'true' || value === '1');

export const idParams = z.object({ id: z.string() });

export const listQuery = z.object({ includeArchived: querySwitch });

export const partnerBody = z.object({
  name: text(120),
  service: passThrough,
  serviceOther: passThrough,
  contactPerson: text(120),
  email: text(254),
  mobile: text(40),
  address: text(255),
  notes: text(2000)
});

export const archiveBody = z.object({
  ids: z
    .array(z.string({ error: 'Each partner id must be text.' }), { error: 'Send the partners as a list of ids.' })
    .max(500, { error: 'Archive up to 500 partners at a time.' }),
  archived: passThrough
});

export const contractBody = z.object({
  partnerId: passThrough,
  reservationRef: passThrough,
  items: z
    .array(z.object({ name: z.string({ error: 'Each item needs a name.' }).default(''), qty: passThrough }), {
      error: 'List the items.'
    })
    .max(200, { error: 'List up to 200 items.' })
    .default([]),
  needBy: passThrough,
  amount: passThrough,
  notes: text(2000)
});

export const sendBody = z.object({ body: text(10000) });

export const statusBody = z.object({ status: passThrough, note: text(1000) });
