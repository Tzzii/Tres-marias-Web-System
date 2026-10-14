import express from 'express';
import multer from 'multer';
import { REFERENCE_PHOTO_MAX_BYTES, REFERENCE_PHOTO_MAX_MB } from '@tm/shared/src/domain/referencePhoto.js';
import { ApiError } from '../../lib/ApiError.js';
import { sendReferencePhoto } from './referencePhoto.js';
import { validate } from '../../middleware/validate.js';
import * as schemas from './reservations.schemas.js';
import * as reservations from './reservations.service.js';



export const reservationRoutes = express.Router();

const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: REFERENCE_PHOTO_MAX_BYTES + 1, files: 1, fields: 1, parts: 2, fieldSize: 256 * 1024 }
}).single('referencePhoto');

function readBooking(req, res, next) {
  if (!req.is('multipart/form-data')) return next();
  photoUpload(req, res, (error) => {
    if (error)
      return next(
        new ApiError(
          'INVALID',
          error.code === 'LIMIT_FILE_SIZE'
            ? `Choose a reference photo up to ${REFERENCE_PHOTO_MAX_MB} MB.`
            : 'The reference photo could not be accepted.',
          { field: 'styling.referencePhoto' }
        )
      );
    if (req.file?.buffer.length > REFERENCE_PHOTO_MAX_BYTES)
      return next(
        new ApiError('INVALID', `Choose a reference photo up to ${REFERENCE_PHOTO_MAX_MB} MB.`, {
          field: 'styling.referencePhoto'
        })
      );
    try {
      req.body = JSON.parse(req.body?.booking);
    } catch {
      return next(new ApiError('INVALID', 'The booking details could not be read.'));
    }
    next();
  });
}

reservationRoutes.get('/', async (req, res) => {
  res.json(await reservations.listReservations({ customerId: req.user.id }));
});
reservationRoutes.post('/', readBooking, validate({ body: schemas.createBody }), async (req, res) => {
  res.status(201).json(await reservations.createReservation(req.user, req.valid.body, { referencePhoto: req.file }));
});
reservationRoutes.get('/:ref/reference-photo', validate({ params: schemas.refParams }), async (req, res) => {
  await sendReferencePhoto(
    res,
    await reservations.getReferencePhoto(req.valid.params.ref, { customerId: req.user.id })
  );
});
reservationRoutes.get('/:ref', validate({ params: schemas.refParams }), async (req, res) => {
  res.json(await reservations.getReservation(req.valid.params.ref, { customerId: req.user.id }));
});
reservationRoutes.post(
  '/:ref/cancel',
  validate({ params: schemas.refParams, body: schemas.reasonBody }),
  async (req, res) => {
    res.json(await reservations.cancelReservation(req.valid.params.ref, req.user, req.valid.body.reason));
  }
);
reservationRoutes.post(
  '/:ref/change-request',
  validate({ params: schemas.refParams, body: schemas.changeBody }),
  async (req, res) => {
    res.json(await reservations.requestChange(req.valid.params.ref, req.user, req.valid.body.message));
  }
);
reservationRoutes.post(
  '/:ref/accept-quotation',
  validate({ params: schemas.refParams, body: schemas.acceptBody }),
  async (req, res) => {
    res.json(await reservations.acceptQuotation(req.valid.params.ref, req.user, req.valid.body.sentAt));
  }
);


export const rentalRoutes = express.Router();

rentalRoutes.get('/availability', validate({ query: schemas.availabilityQuery }), async (req, res) => {
  const { date, excludeRef } = req.valid.query;
  res.json(
    await reservations.getRentalAvailability(date, { excludeRef: req.user.role === 'admin' ? excludeRef : undefined })
  );
});


export const reservationAdminRoutes = express.Router();

reservationAdminRoutes.get('/:ref/reference-photo', validate({ params: schemas.refParams }), async (req, res) => {
  await sendReferencePhoto(res, await reservations.getReferencePhoto(req.valid.params.ref));
});

reservationAdminRoutes.get('/', async (req, res) => {
  res.json(await reservations.listReservations());
});
reservationAdminRoutes.get('/:ref', validate({ params: schemas.refParams }), async (req, res) => {
  res.json(await reservations.getReservation(req.valid.params.ref));
});

reservationAdminRoutes.post(
  '/:ref/quotation',
  validate({ params: schemas.refParams, body: schemas.quotationBody }),
  async (req, res) => {
    res.json(await reservations.sendQuotation(req.valid.params.ref, req.valid.body, req.user));
  }
);
reservationAdminRoutes.post(
  '/:ref/decline',
  validate({ params: schemas.refParams, body: schemas.reasonBody }),
  async (req, res) => {
    res.json(await reservations.declineReservation(req.valid.params.ref, req.valid.body.reason, req.user));
  }
);
reservationAdminRoutes.post('/:ref/confirm', validate({ params: schemas.refParams }), async (req, res) => {
  res.json(await reservations.confirmReservation(req.valid.params.ref, req.user));
});
reservationAdminRoutes.post('/:ref/complete', validate({ params: schemas.refParams }), async (req, res) => {
  res.json(await reservations.completeReservation(req.valid.params.ref, req.user));
});
reservationAdminRoutes.post(
  '/:ref/cancel',
  validate({ params: schemas.refParams, body: schemas.reasonBody }),
  async (req, res) => {
    res.json(await reservations.cancelReservationByAdmin(req.valid.params.ref, req.valid.body.reason, req.user));
  }
);
reservationAdminRoutes.post('/:ref/preparing', validate({ params: schemas.refParams }), async (req, res) => {
  res.json(await reservations.startPreparing(req.valid.params.ref, req.user));
});
reservationAdminRoutes.delete('/:ref/preparing', validate({ params: schemas.refParams }), async (req, res) => {
  res.json(await reservations.undoPreparing(req.valid.params.ref, req.user));
});

reservationAdminRoutes.patch(
  '/:ref/logistics',
  validate({ params: schemas.refParams, body: schemas.logisticsBody }),
  async (req, res) => {
    res.json(await reservations.updateLogistics(req.valid.params.ref, req.valid.body, req.user));
  }
);
reservationAdminRoutes.put(
  '/:ref/menu',
  validate({ params: schemas.refParams, body: schemas.menuBody }),
  async (req, res) => {
    res.json(await reservations.updateMenu(req.valid.params.ref, req.valid.body, req.user));
  }
);
reservationAdminRoutes.put(
  '/:ref/styling',
  validate({ params: schemas.refParams, body: schemas.stylingBody }),
  async (req, res) => {
    res.json(await reservations.updateStyling(req.valid.params.ref, req.valid.body, req.user));
  }
);
reservationAdminRoutes.put(
  '/:ref/notes',
  validate({ params: schemas.refParams, body: schemas.notesBody }),
  async (req, res) => {
    res.json(await reservations.saveNotes(req.valid.params.ref, req.valid.body.notes));
  }
);
reservationAdminRoutes.put(
  '/:ref/rental-items',
  validate({ params: schemas.refParams, body: schemas.rentalItemsBody }),
  async (req, res) => {
    res.json(await reservations.updateRentalItems(req.valid.params.ref, req.valid.body, req.user));
  }
);
