import { Request, Response, NextFunction } from "express";
import { firebaseAuth } from "../config/firebase";

export interface AuthenticatedRequest extends Request {
  user: {
    uid: string;
    email?: string;
    role?: string;
  };
}

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Token de autorización requerido",
      });
    }

    const token = authHeader.split(" ")[1];

    const decodedToken = await firebaseAuth.verifyIdToken(token);

    (req as AuthenticatedRequest).user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
    };

    next();
  } catch (error: any) {
    console.error("Error en autenticación:", error);

    if (error.code === "auth/id-token-expired") {
      return res.status(401).json({
        error: "Token expirado",
      });
    }

    if (error.code === "auth/invalid-id-token") {
      return res.status(401).json({
        error: "Token inválido",
      });
    }

    return res.status(401).json({
      error: "No autorizado",
    });
  }
};
