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
export const refParams = z.object({ ref: z.string() });

export const listQuery = z.object({ includeArchived: querySwitch });

const itemFields = {
  name: z.string({ error: 'Enter the item name.' }).default(''),
  category: passThrough,
  total: passThrough,
  lowStockAt: passThrough,
  rentable: passThrough,
  rentPrice: passThrough,
  damageFee: passThrough,
  notes: z.string({ error: 'Notes must be text.' }).max(2000, { error: 'Use 2000 characters or fewer.' }).default('')
};

export const addBody = z.object({
  items: z.array(z.object(itemFields), { error: 'Send the new items as a list.' }).default([])
});

export const updateBody = z.object({ ...itemFields, name: text(120), removePhoto: z.boolean().optional() });

export const moveBody = z.object({
  action: passThrough,
  qty: passThrough,
  damagedQty: passThrough,
  ref: passThrough,
  note: text(1000)
});

export const archiveBody = z.object({
  ids: z
    .array(z.string({ error: 'Each item id must be text.' }), { error: 'Send the items as a list of ids.' })
    .max(500, { error: 'Archive up to 500 items at a time.' }),
  archived: passThrough
});

export const returnBody = z.object({
  returns: z
    .array(z.object({ itemId: passThrough, good: passThrough, damaged: passThrough }), {
      error: 'Send the returned items as a list.'
    })
    .max(500, { error: 'Send up to 500 rows at a time.' })
    .default([])
});
