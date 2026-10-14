import express from 'express';
import { validate } from '../../middleware/validate.js';
import * as schemas from './messages.schemas.js';
import * as messages from './messages.service.js';



export const threadRoutes = express.Router();

threadRoutes.get('/', async (req, res) => {
  res.json(await messages.listThreads({ customerId: req.user.id, side: 'customer' }));
});
threadRoutes.post('/', async (req, res) => {
  res.json(await messages.openThread({ customerId: req.user.id }));
});
threadRoutes.get('/:id', validate({ params: schemas.threadParams }), async (req, res) => {
  res.json(await messages.getThread(req.valid.params.id, { customerId: req.user.id, side: 'customer' }));
});
threadRoutes.post('/:id/read', validate({ params: schemas.threadParams }), async (req, res) => {
  res.json(await messages.markThreadRead(req.valid.params.id, 'customer', { customerId: req.user.id }));
});
threadRoutes.post(
  '/:id/messages',
  validate({ params: schemas.threadParams, body: schemas.sendBody }),
  async (req, res) => {
    const { body, ref } = req.valid.body;
    res.status(201).json(
      await messages.sendMessage(req.valid.params.id, {
        side: 'customer',
        senderName: req.user.name,
        body,
        customerId: req.user.id,
        ref
      })
    );
  }
);
threadRoutes.patch(
  '/:id/messages/:messageId',
  validate({ params: schemas.messageParams, body: schemas.editBody }),
  async (req, res) => {
    const { id, messageId } = req.valid.params;
    res.json(
      await messages.editMessage(id, messageId, {
        side: 'customer',
        customerId: req.user.id,
        body: req.valid.body.body
      })
    );
  }
);
threadRoutes.delete('/:id/messages/:messageId', validate({ params: schemas.messageParams }), async (req, res) => {
  const { id, messageId } = req.valid.params;
  res.json(await messages.deleteMessage(id, messageId, { side: 'customer', customerId: req.user.id }));
});


export const threadAdminRoutes = express.Router();

threadAdminRoutes.get('/', validate({ query: schemas.listQuery }), async (req, res) => {
  const { customerId } = req.valid.query;
  res.json(
    await messages.listThreads({ customerId: typeof customerId === 'string' ? customerId : undefined, side: 'admin' })
  );
});
threadAdminRoutes.post('/', validate({ body: schemas.openBody }), async (req, res) => {
  res.json(await messages.openThread({ customerId: req.valid.body.customerId }));
});
threadAdminRoutes.get('/:id', validate({ params: schemas.threadParams }), async (req, res) => {
  res.json(await messages.getThread(req.valid.params.id, { side: 'admin' }));
});
threadAdminRoutes.post('/:id/read', validate({ params: schemas.threadParams }), async (req, res) => {
  res.json(await messages.markThreadRead(req.valid.params.id, 'admin'));
});
threadAdminRoutes.post(
  '/:id/messages',
  validate({ params: schemas.threadParams, body: schemas.sendBody }),
  async (req, res) => {
    const { body, ref } = req.valid.body;
    res
      .status(201)
      .json(await messages.sendMessage(req.valid.params.id, { side: 'admin', senderName: req.user.name, body, ref }));
  }
);
threadAdminRoutes.patch(
  '/:id/messages/:messageId',
  validate({ params: schemas.messageParams, body: schemas.editBody }),
  async (req, res) => {
    const { id, messageId } = req.valid.params;
    res.json(await messages.editMessage(id, messageId, { side: 'admin', body: req.valid.body.body }));
  }
);
threadAdminRoutes.delete('/:id/messages/:messageId', validate({ params: schemas.messageParams }), async (req, res) => {
  const { id, messageId } = req.valid.params;
  res.json(await messages.deleteMessage(id, messageId, { side: 'admin' }));
});
