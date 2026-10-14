import express from 'express';
import { readStamp } from './changes.repo.js';

export const changesRoutes = express.Router();

changesRoutes.get('/', async (req, res) => {
  res.json({ stamp: await readStamp() });
});
