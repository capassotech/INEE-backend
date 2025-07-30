// /src/modules/purchases/controller.ts
import { Response } from 'express';
import { firestore } from '../../config/firebase';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import { Purchase } from './types';

const collection = firestore.collection('purchases');

export const listUserPurchases = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const snapshot = await collection
      .where('userId', '==', req.user.uid)
      .where('paymentStatus', '==', 'approved')
      .get();

    const purchases = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    return res.json(purchases);
  } catch (err) {
    console.error('listUserPurchases error:', err);
    return res.status(500).json({ error: 'Error al obtener compras' });
  }
};

export const hasAccessToCourse = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { courseId } = req.params;

    const snapshot = await collection
      .where('userId', '==', req.user.uid)
      .where('courseId', '==', courseId)
      .where('paymentStatus', '==', 'approved')
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res.status(403).json({ access: false });
    }

    return res.json({ access: true });
  } catch (err) {
    console.error('hasAccessToCourse error:', err);
    return res.status(500).json({ error: 'Error al verificar acceso' });
  }
};

export const createPurchase = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { courseId, paymentStatus } = req.body;

    const purchase: Purchase = {
      userId: req.user.uid,
      courseId,
      createdAt: new Date(),
      paymentStatus: paymentStatus || 'approved', // si viene de webhook, este campo es clave
    };

    const docRef = await collection.add(purchase);
    return res.status(201).json({ id: docRef.id });
  } catch (err) {
    console.error('createPurchase error:', err);
    return res.status(500).json({ error: 'Error al registrar compra' });
  }
};
