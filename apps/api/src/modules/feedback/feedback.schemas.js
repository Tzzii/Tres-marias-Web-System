import { z } from 'zod';


const text = (max) =>
  z
    .string({ error: 'This field is required.' })
    .max(max, { error: `Use ${max} characters or fewer.` })
    .default('');

const passThrough = z.unknown().optional();

export const idParams = z.object({ id: z.string() });

export const publishedQuery = z.object({
  limit: z.coerce
    .number({ error: 'Ask for 1 to 20 reviews.' })
    .int({ error: 'Ask for 1 to 20 reviews.' })
    .min(1, { error: 'Ask for 1 to 20 reviews.' })
    .max(20, { error: 'Ask for 1 to 20 reviews.' })
    .default(3)
});

export const createBody = z.object({
  ref: passThrough,
  rating: passThrough,
  categories: passThrough,
  body: text(2000)
});

export const statusBody = z.object({ status: passThrough });

export const featuredBody = z.object({ featured: passThrough });
export const archivedBody = z.object({ archived: passThrough });

export const flagBody = z.object({ flagged: passThrough, reason: text(1000) });

export const replyBody = z.object({ body: passThrough });
