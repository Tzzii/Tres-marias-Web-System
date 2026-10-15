import { z } from 'zod';

const text = (max) =>
  z
    .string({ error: 'This field is required.' })
    .max(max, { error: `Use ${max} characters or fewer.` })
    .default('');

const passThrough = z.unknown().optional();

export const refParams = z.object({ ref: z.string() });

export const createBody = z.object({
  packageId: passThrough,
  serviceType: passThrough,
  eventName: text(120),
  occasion: text(40),
  occasionOther: text(40),
  date: passThrough,
  startTime: passThrough,
  endTime: passThrough,
  agreeTerms: passThrough,
  guests: passThrough,
  menu: passThrough,
  foodNotes: text(2000),
  styling: passThrough,
  addonIds: passThrough,
  addonQty: passThrough,
  venueName: text(160),
  venueAddress: text(255),
  city: text(120),
  accessNotes: text(2000),
  fulfilment: passThrough,
  rentalItems: passThrough
});

export const reasonBody = z.object({ reason: text(2000) });

export const changeBody = z.object({ message: text(2000) });

export const acceptBody = z.object({ sentAt: passThrough });

export const availabilityQuery = z.object({ date: passThrough, excludeRef: passThrough });

export const quotationBody = z.object({
  addonPrices: passThrough,
  extraGuestsCharge: passThrough,
  itemCounts: passThrough,
  otherCharges: passThrough,
  otherChargeItems: z.array(z.object({ amount: z.number().int().min(0).max(10000000), label: text(60) })).optional(),
  otherLabel: text(60),
  discount: passThrough,
  deliveryFee: passThrough,
  note: text(300)
});

export const logisticsBody = z.object({
  date: passThrough,
  startTime: passThrough,
  endTime: passThrough,
  guests: passThrough,
  fulfilment: passThrough,
  venueName: text(160),
  venueAddress: text(255),
  city: text(120),
  accessNotes: text(2000)
});

export const menuBody = z.object({ serviceType: passThrough, menu: passThrough, foodNotes: text(2000) });

export const stylingBody = z.object({
  theme: passThrough,
  themeOther: passThrough,
  colors: passThrough,
  notes: passThrough
});

export const notesBody = z.object({ notes: text(2000) });

export const rentalItemsBody = z.object({ items: passThrough });
