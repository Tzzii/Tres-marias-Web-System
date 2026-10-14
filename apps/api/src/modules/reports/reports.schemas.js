import { z } from 'zod';
import { REPORT_RANGES } from '@tm/shared/src/domain/reports.js';


export const rangeQuery = z.object({
  range: z.enum(REPORT_RANGES, { error: 'Unknown report range.' }).default('this_year')
});

export const kindParams = z.object({ kind: z.string() });
