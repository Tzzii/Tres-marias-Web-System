// Public face of the outsourcing service (partners and contracts): pages import it through outsourceApi (@tm/shared).
// Each call goes to the browser-store version or the API version, chosen once at startup (backend.js).
import * as local from '../outsourceService.js';
import { pickImpl } from '../backend.js';

// The API version arrives in Phase 10 (services/remote/outsource.js); until then the browser store answers
const impl = pickImpl('outsource', local);

export const listPartners = (...a) => impl.listPartners(...a);
export const listContracts = (...a) => impl.listContracts(...a);
export const listOutsourceEvents = (...a) => impl.listOutsourceEvents(...a);
export const savePartner = (...a) => impl.savePartner(...a);
export const setPartnerArchived = (...a) => impl.setPartnerArchived(...a);
export const saveContract = (...a) => impl.saveContract(...a);
export const sendContract = (...a) => impl.sendContract(...a);
export const setContractStatus = (...a) => impl.setContractStatus(...a);

// Constants and pure helpers that take all their input as arguments: the same on both sides, so they come
// straight from domain/outsource.js (the API server uses the same file)
export { NO_EVENT, CONTRACT_STATUSES, channelsOf, composeContractText } from '../../domain/outsource.js';
