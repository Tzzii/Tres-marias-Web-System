import { z } from 'zod';

/**
 * Request shapes for the chat routes (zod), checked by middleware/validate.js before a service runs.
 * Like reservations.schemas.js, these only keep out what the service cannot answer itself (a huge
 * text); the rest passes through to messages.service.js, which answers with the chat's own
 * messages. Keys not listed are dropped, so a side, senderName or customerId added to a request never
 * reaches a service.
 */

// Checked by the service. .optional() matters: in zod 4 a z.unknown() object key is still required.
const passThrough = z.unknown().optional();

// A thread id from the URL (Express always gives text); an unknown one is a 404 from the service
export const threadParams = z.object({ id: z.string() });

// POST …/threads/:id/messages { body, ref }. The service trims the body and holds it to 2,000 characters
// with the chat's messages; this limit only stops a request from sending a huge text.
export const sendBody = z.object({
  body: z.string({ error: 'Write a message first.' }).max(10000, { error: 'Messages can be up to 2,000 characters.' }).default(''),
  ref: passThrough
});

// GET /api/admin/threads?customerId=… : one customer's conversation (the admin's chat buttons look it up first)
export const listQuery = z.object({ customerId: passThrough });

// POST /api/admin/threads { customerId }: start that customer's conversation
export const openBody = z.object({ customerId: passThrough });
