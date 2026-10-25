import { z } from 'zod';

const text = (max) =>
  z
    .string({ error: 'This field is required.' })
    .max(max, { error: `Use ${max} characters or fewer.` })
    .default('');

const passThrough = z.unknown().optional();

const flag = (label) => z.boolean({ error: `${label} must be true or false.` });

const querySwitch = z
  .unknown()
  .optional()
  .transform((value) => value === 'true' || value === '1');

const pathText = z.string();

export const packagesQuery = z.object({ includeHidden: querySwitch, includeArchived: querySwitch });
export const archivedQuery = z.object({ includeArchived: querySwitch });
export const slugParams = z.object({ slug: pathText });

export const idParams = z.object({ id: pathText });

export const packageBody = z.object({
  name: text(120),
  description: text(2000),
  price: passThrough,
  guests: passThrough,
  items: passThrough,
  visible: flag('Visible').optional(),
  removePhoto: flag('Remove photo').optional()
});
export const visibilityBody = z.object({ visible: flag('Visible') });
export const archivedBody = z.object({ archived: flag('Archived') });

export const addonBody = z.object({
  name: text(120),
  description: text(2000),
  price: passThrough,
  hasQuantity: flag('Ask how many').default(false),
  hasPackages: flag('With packages').default(false),
  inventoryItemId: passThrough,
  sizes: passThrough
});

export const dishBody = z.object({ name: text(120), category: passThrough });

export const pricePerPlateBody = z.object({ pricePerPlate: passThrough });

export const minDownpaymentBody = z.object({ minDownpayment: passThrough });
export const sixHourFeeBody = z.object({ sixHourFee: passThrough });
