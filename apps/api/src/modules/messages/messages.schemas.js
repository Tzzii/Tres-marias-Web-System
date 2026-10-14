import { z } from 'zod';


const passThrough = z.unknown().optional();

export const threadParams = z.object({ id: z.string() });

export const sendBody = z.object({
  body: z
    .string({ error: 'Write a message first.' })
    .max(10000, { error: 'Messages can be up to 2,000 characters.' })
    .default(''),
  ref: passThrough
});

export const messageParams = z.object({ id: z.string(), messageId: z.string() });

export const editBody = z.object({
  body: z
    .string({ error: 'Write a message first.' })
    .max(10000, { error: 'Messages can be up to 2,000 characters.' })
    .default('')
});

export const listQuery = z.object({ customerId: passThrough });

export const openBody = z.object({ customerId: passThrough });
