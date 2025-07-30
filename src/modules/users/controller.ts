import { Request, Response } from 'express';
import { firestore } from '../../config/firebase';

export const getUserProfile = async (req: any, res: Response) => {
  const uid = req.user.uid;
  const userDoc = await firestore.collection('users').doc(uid).get();

  if (!userDoc.exists) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  return res.json(userDoc.data());
};
