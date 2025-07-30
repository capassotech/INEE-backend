import { Request, Response } from 'express';
import { firebaseAuth } from '../../config/firebase';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';

export const verifyUser = async (req: any, res: Response) => {
  const { uid, role } = req.user;
  return res.json({ uid, role });
};