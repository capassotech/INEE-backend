import { Request, Response, NextFunction } from "express";
import { firebaseAuth } from "../config/firebase";

export interface AuthenticatedRequest extends Request {
  user: {
    uid: string;
    email?: string;
    // role?: string;
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
    console.error("Error code:", error.code);
    console.error("Error message:", error.message);

    if (error.code === "auth/id-token-expired") {
      return res.status(401).json({
        error: "Token expirado",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }

    if (error.code === "auth/invalid-id-token") {
      return res.status(401).json({
        error: "Token inválido",
        details: process.env.NODE_ENV === "development" 
          ? "Asegúrate de usar idToken (no customToken). Haz un nuevo login." 
          : undefined,
      });
    }

    // Error común: usar customToken en lugar de idToken
    if (error.message && error.message.includes("custom token")) {
      return res.status(401).json({
        error: "Token inválido",
        details: process.env.NODE_ENV === "development" 
          ? "Estás usando un customToken. Necesitas hacer un nuevo login para obtener un idToken." 
          : undefined,
      });
    }

    return res.status(401).json({
      error: "No autorizado",
      details: process.env.NODE_ENV === "development" 
        ? error.message || error.code 
        : undefined,
    });
  }
};
