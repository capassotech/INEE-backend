// /src/modules/purchases/routes.ts
import { Router } from 'express';
import {
  listUserPurchases,
  hasAccessToCourse,
  createPurchase,
} from './controller';
import { authMiddleware } from '../../middleware/authMiddleware';

const router = Router();

// router.get('/', authMiddleware, listUserPurchases);
// router.get('/access/:courseId', authMiddleware, hasAccessToCourse);
// router.post('/', authMiddleware, createPurchase); 

export default router;
