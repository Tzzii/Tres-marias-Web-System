// Public face of the catalog service (packages, add-ons, dishes, the buffet price per person and the
// rental price list): pages import it through catalogApi (@tm/shared).
// Each call goes to the browser-store version or the API version, chosen once at startup (backend.js).
import * as local from '../catalogService.js';
import * as remote from '../remote/catalog.js';
import { pickImpl } from '../backend.js';

// The API version since Phase 4 (services/remote/catalog.js), when VITE_API_SERVICES includes "catalog"
const impl = pickImpl('catalog', local, remote);

export const listPackages = (...a) => impl.listPackages(...a);
export const getPackageBySlug = (...a) => impl.getPackageBySlug(...a);
export const listAddons = (...a) => impl.listAddons(...a);
export const listDishes = (...a) => impl.listDishes(...a);
export const getCatalog = (...a) => impl.getCatalog(...a);
export const listRentalItems = (...a) => impl.listRentalItems(...a);
export const savePackage = (...a) => impl.savePackage(...a);
export const setPackageVisibility = (...a) => impl.setPackageVisibility(...a);
export const setPackageArchived = (...a) => impl.setPackageArchived(...a);
export const saveAddon = (...a) => impl.saveAddon(...a);
export const setAddonArchived = (...a) => impl.setAddonArchived(...a);
export const saveDish = (...a) => impl.saveDish(...a);
export const setDishArchived = (...a) => impl.setDishArchived(...a);
export const setPricePerPlate = (...a) => impl.setPricePerPlate(...a);
// Returns right away (no waiting): pages read the current buffet price per person while rendering.
// The API version answers from its copy of the server's price (see remote/catalog.js).
export const pricePerPlate = (...a) => impl.pricePerPlate(...a);
