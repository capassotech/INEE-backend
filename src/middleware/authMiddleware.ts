import { Request, Response, NextFunction } from 'express';
import { firebaseAuth, firestore } from '../config/firebase';

export interface AuthenticatedRequest extends Request {
  user: {
    uid: string;
    email?: string;
    role: string;
  };
}

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token no proporcionado' });
    }

    const idToken = authHeader.split(' ')[1];
    const decodedToken = await firebaseAuth.verifyIdToken(idToken);
    const uid = decodedToken.uid;

    // Buscar datos del usuario en Firestore
    const userDoc = await firestore.collection('users').doc(uid).get();

    if (!userDoc.exists) {
      return res.status(403).json({ error: 'Usuario no registrado en Firestore' });
    }

    const userData = userDoc.data();

    (req as AuthenticatedRequest).user = {
      uid,
      email: decodedToken.email,
      role: userData?.role || 'alumno',
    };

    next();
  } catch (error) {
    console.error('authMiddleware error:', error);
    return res.status(401).json({ error: 'Token inválido' });
  }
};
