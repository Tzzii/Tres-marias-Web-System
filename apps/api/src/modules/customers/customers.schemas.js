import { z } from 'zod';


const text = (max) =>
  z
    .string({ error: 'This field is required.' })
    .max(max, { error: `Use ${max} characters or fewer.` })
    .default('');

export const idParams = z.object({ id: z.string() });

export const contactBody = z.object({ email: text(254), mobile: text(40) });
