import { z } from 'zod';
import { REPORT_RANGES } from '@tm/shared/src/domain/reports.js';

/**
 * Request shapes for the report routes (zod), checked by middleware/validate.js before a service runs.
 * The range must be one the Reports page offers, refused with the browser version's message (rangeProblem
 * in domain/reports.js); without one it is this year, as on the page. The saved report's name is any text
 * here: reports.service.js answers an unknown one exactly as the browser version does.
 */

// ?range=this_year | last_12 | last_year | all (a repeated ?range= arrives as a list and is refused too)
export const rangeQuery = z.object({ range: z.enum(REPORT_RANGES, { error: 'Unknown report range.' }).default('this_year') });

// /saved/:kind (Express always gives text)
export const kindParams = z.object({ kind: z.string() });
