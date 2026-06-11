import { Router, Request, Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../../middleware/authMiddleware';
import { getDashboardStats } from './controller';

const router = Router();

router.get(
  '/stats',
  authMiddleware,
  (req: Request, res: Response) => getDashboardStats(req as AuthenticatedRequest, res)
);

export default router;
