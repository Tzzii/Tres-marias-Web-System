import express from 'express';
import { validate } from '../../middleware/validate.js';
import * as schemas from './outsource.schemas.js';
import * as outsource from './outsource.service.js';


export const outsourceAdminRoutes = express.Router();

outsourceAdminRoutes.get('/events', async (req, res) => {
  res.json(await outsource.listOutsourceEvents());
});

outsourceAdminRoutes.get('/partners', validate({ query: schemas.listQuery }), async (req, res) => {
  res.json(await outsource.listPartners({ includeArchived: req.valid.query.includeArchived }));
});
outsourceAdminRoutes.post('/partners', validate({ body: schemas.partnerBody }), async (req, res) => {
  res.status(201).json(await outsource.savePartner(null, req.valid.body, req.user));
});
outsourceAdminRoutes.post('/partners/archive', validate({ body: schemas.archiveBody }), async (req, res) => {
  res.json(await outsource.setPartnerArchived(req.valid.body.ids, req.valid.body.archived, req.user));
});
outsourceAdminRoutes.put(
  '/partners/:id',
  validate({ params: schemas.idParams, body: schemas.partnerBody }),
  async (req, res) => {
    res.json(await outsource.savePartner(req.valid.params.id, req.valid.body, req.user));
  }
);
outsourceAdminRoutes.delete('/partners/:id', validate({ params: schemas.idParams }), async (req, res) => {
  await outsource.deletePartner(req.valid.params.id, req.user);
  res.status(204).end();
});

outsourceAdminRoutes.get('/contracts', async (req, res) => {
  res.json(await outsource.listContracts());
});
outsourceAdminRoutes.post('/contracts', validate({ body: schemas.contractBody }), async (req, res) => {
  res.status(201).json(await outsource.saveContract(null, req.valid.body, req.user));
});
outsourceAdminRoutes.put(
  '/contracts/:id',
  validate({ params: schemas.idParams, body: schemas.contractBody }),
  async (req, res) => {
    res.json(await outsource.saveContract(req.valid.params.id, req.valid.body, req.user));
  }
);
outsourceAdminRoutes.post(
  '/contracts/:id/send',
  validate({ params: schemas.idParams, body: schemas.sendBody }),
  async (req, res) => {
    res.json(await outsource.sendContract(req.valid.params.id, req.valid.body.body, req.user));
  }
);
outsourceAdminRoutes.post(
  '/contracts/:id/status',
  validate({ params: schemas.idParams, body: schemas.statusBody }),
  async (req, res) => {
    res.json(
      await outsource.setContractStatus(req.valid.params.id, req.valid.body.status, req.valid.body.note, req.user)
    );
  }
);
