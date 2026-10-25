import express from 'express';
import { ApiError } from '../../lib/ApiError.js';
import { optionalAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as schemas from './catalog.schemas.js';
import * as catalog from './catalog.service.js';
import { storage } from '../../integrations/storage/index.js';
import { photoUpload } from '../../middleware/photoUpload.js';
import { sendInventoryPhoto } from '../inventory/inventory.photo.js';

const uploadPhoto = photoUpload('photo');
function packageForm(req, res, next) {
  if (!req.is('multipart/form-data')) return next();
  uploadPhoto(req, res, (err) => {
    if (err) return next(err);
    try {
      req.body = JSON.parse(req.body.package);
      return next();
    } catch {
      return next(new ApiError('INVALID', 'The package form could not be read.'));
    }
  });
}

async function sendPackagePhoto(req, res, admin = false) {
  const photo = await catalog.getPackagePhoto(req.valid.params.id, { admin, version: req.query.v });
  const stream = storage.stream(photo.key);
  await new Promise((resolve, reject) => {
    stream.once('open', resolve);
    stream.once('error', reject);
  }).catch(() => {
    throw new ApiError('NOT_FOUND', 'This photo is no longer available.');
  });
  res.set({
    'Content-Type': photo.mime,
    'Content-Disposition': 'inline',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'cross-origin'
  });
  stream.on('error', () => res.destroy());
  res.on('close', () => stream.destroy());
  stream.pipe(res);
}

function viewer(req, wantsAdminView) {
  if (wantsAdminView && !req.user && req.get('Authorization'))
    throw new ApiError('UNAUTHENTICATED', 'Please sign in again.');
  return { admin: Boolean(req.user && req.user.role === 'admin') };
}

export const catalogRoutes = express.Router();

catalogRoutes.get('/rental-items/:id/photo', validate({ params: schemas.idParams }), async (req, res) => {
  await sendInventoryPhoto(req, res);
});

catalogRoutes.get('/packages/:id/photo', validate({ params: schemas.idParams }), async (req, res) => {
  await sendPackagePhoto(req, res);
});

catalogRoutes.get('/packages', optionalAuth, validate({ query: schemas.packagesQuery }), async (req, res) => {
  const { query } = req.valid;
  res.json(await catalog.listPackages(query, viewer(req, query.includeHidden || query.includeArchived)));
});
catalogRoutes.get('/packages/by-slug/:slug', validate({ params: schemas.slugParams }), async (req, res) => {
  res.json(await catalog.getPackageBySlug(req.valid.params.slug));
});
catalogRoutes.get('/addons', optionalAuth, validate({ query: schemas.archivedQuery }), async (req, res) => {
  const { query } = req.valid;
  res.json(await catalog.listAddons(query, viewer(req, query.includeArchived)));
});
catalogRoutes.get('/dishes', optionalAuth, validate({ query: schemas.archivedQuery }), async (req, res) => {
  const { query } = req.valid;
  res.json(await catalog.listDishes(query, viewer(req, query.includeArchived)));
});
catalogRoutes.get('/catalog', async (req, res) => {
  res.json(await catalog.getCatalog());
});
catalogRoutes.get('/catalog/pricing', async (req, res) => {
  res.json(await catalog.getPricingSettings());
});
catalogRoutes.get('/catalog/price-per-plate', async (req, res) => {
  res.json(await catalog.getPricePerPlate());
});
catalogRoutes.get('/catalog/min-downpayment', async (req, res) => {
  res.json(await catalog.getMinDownpayment());
});
catalogRoutes.get('/catalog/six-hour-fee', async (req, res) => {
  res.json(await catalog.getSixHourFee());
});
catalogRoutes.get('/rental-items', async (req, res) => {
  res.json(await catalog.listRentalItems());
});

export const catalogAdminRoutes = express.Router();

catalogAdminRoutes.post('/packages', packageForm, validate({ body: schemas.packageBody }), async (req, res) => {
  res.status(201).json(await catalog.savePackage(null, req.valid.body, req.file));
});
catalogAdminRoutes.put(
  '/packages/:id',
  packageForm,
  validate({ params: schemas.idParams, body: schemas.packageBody }),
  async (req, res) => {
    res.json(await catalog.savePackage(req.valid.params.id, req.valid.body, req.file));
  }
);
catalogAdminRoutes.get('/packages/:id/photo', validate({ params: schemas.idParams }), async (req, res) => {
  await sendPackagePhoto(req, res, true);
});
catalogAdminRoutes.patch(
  '/packages/:id/visibility',
  validate({ params: schemas.idParams, body: schemas.visibilityBody }),
  async (req, res) => {
    res.json(await catalog.setPackageVisibility(req.valid.params.id, req.valid.body.visible));
  }
);
catalogAdminRoutes.patch(
  '/packages/:id/archived',
  validate({ params: schemas.idParams, body: schemas.archivedBody }),
  async (req, res) => {
    res.json(await catalog.setPackageArchived(req.valid.params.id, req.valid.body.archived));
  }
);

catalogAdminRoutes.post('/addons', validate({ body: schemas.addonBody }), async (req, res) => {
  res.status(201).json(await catalog.saveAddon(null, req.valid.body));
});
catalogAdminRoutes.put(
  '/addons/:id',
  validate({ params: schemas.idParams, body: schemas.addonBody }),
  async (req, res) => {
    res.json(await catalog.saveAddon(req.valid.params.id, req.valid.body));
  }
);
catalogAdminRoutes.patch(
  '/addons/:id/archived',
  validate({ params: schemas.idParams, body: schemas.archivedBody }),
  async (req, res) => {
    res.json(await catalog.setAddonArchived(req.valid.params.id, req.valid.body.archived));
  }
);
catalogAdminRoutes.delete('/addons/:id', validate({ params: schemas.idParams }), async (req, res) => {
  res.json(await catalog.deleteAddon(req.valid.params.id));
});

catalogAdminRoutes.post('/dishes', validate({ body: schemas.dishBody }), async (req, res) => {
  res.status(201).json(await catalog.saveDish(null, req.valid.body));
});
catalogAdminRoutes.put(
  '/dishes/:id',
  validate({ params: schemas.idParams, body: schemas.dishBody }),
  async (req, res) => {
    res.json(await catalog.saveDish(req.valid.params.id, req.valid.body));
  }
);
catalogAdminRoutes.patch(
  '/dishes/:id/archived',
  validate({ params: schemas.idParams, body: schemas.archivedBody }),
  async (req, res) => {
    res.json(await catalog.setDishArchived(req.valid.params.id, req.valid.body.archived));
  }
);
catalogAdminRoutes.delete('/dishes/:id', validate({ params: schemas.idParams }), async (req, res) => {
  res.json(await catalog.deleteDish(req.valid.params.id));
});

catalogAdminRoutes.put('/catalog/price-per-plate', validate({ body: schemas.pricePerPlateBody }), async (req, res) => {
  res.json(await catalog.setPricePerPlate(req.valid.body.pricePerPlate));
});

catalogAdminRoutes.put('/catalog/min-downpayment', validate({ body: schemas.minDownpaymentBody }), async (req, res) => {
  res.json(await catalog.setMinDownpayment(req.valid.body.minDownpayment));
});
catalogAdminRoutes.put('/catalog/six-hour-fee', validate({ body: schemas.sixHourFeeBody }), async (req, res) => {
  res.json(await catalog.setSixHourFee(req.valid.body.sixHourFee));
});
