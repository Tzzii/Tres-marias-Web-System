import { z } from 'zod';


const passThrough = z.unknown().optional();

export const checkQuery = z.object({ date: passThrough, time: passThrough, end: passThrough });

export const blockBody = z.object({ from: passThrough, to: passThrough, reason: passThrough, note: passThrough });

export const dateParams = z.object({ date: z.string() });

export const capacityBody = z.object({ value: passThrough });
