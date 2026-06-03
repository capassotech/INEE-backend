import { Request, Response, NextFunction } from "express";
import { firebaseAuth } from "../config/firebase";
import {
  clearSessionCookie,
  getSessionErrorMessage,
  getSessionIdFromRequest,
  validateUserSession,
} from "../services/userSession";

export interface AuthenticatedRequest extends Request {
  user: {
    uid: string;
    email?: string;
    sessionId: string;
    sessionLoginAt: Date;
    sessionExpiresAt: Date;
  };
}

const respondUnauthorized = (
  res: Response,
  error: string,
  code?: string
) => {
  clearSessionCookie(res);
  return res.status(401).json({
    error,
    ...(code ? { code } : {}),
  });
};

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.warn("[AUTH] Sesión inválida — motivo=token_ausente");
      return respondUnauthorized(res, "Token de autorización requerido", "AUTH_TOKEN_REQUIRED");
    }

    const token = authHeader.split(" ")[1];
    const decodedToken = await firebaseAuth.verifyIdToken(token);
    const sessionIdFromRequest = getSessionIdFromRequest(req);
    const sessionResult = await validateUserSession(
      decodedToken.uid,
      sessionIdFromRequest
    );

    if (!sessionResult.valid) {
      return respondUnauthorized(
        res,
        getSessionErrorMessage(sessionResult.reason),
        sessionResult.reason === "expired" ? "SESSION_EXPIRED" : "SESSION_INVALID"
      );
    }

    (req as AuthenticatedRequest).user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      sessionId: sessionResult.sessionId,
      sessionLoginAt: sessionResult.loginAt,
      sessionExpiresAt: sessionResult.expiresAt,
    };

    next();
  } catch (error: any) {
    console.error("[AUTH] Sesión inválida — motivo=error_verificacion_token", error?.code || error?.message);

    if (error.code === "auth/id-token-expired") {
      return respondUnauthorized(
        res,
        "Token expirado",
        "AUTH_TOKEN_EXPIRED"
      );
    }

    if (error.code === "auth/invalid-id-token") {
      return respondUnauthorized(
        res,
        "Token inválido",
        "AUTH_TOKEN_INVALID"
      );
    }

    if (error.message && error.message.includes("custom token")) {
      return respondUnauthorized(
        res,
        "Token inválido",
        "AUTH_CUSTOM_TOKEN_NOT_ALLOWED"
      );
    }

    return respondUnauthorized(res, "No autorizado", "AUTH_UNAUTHORIZED");
  }
};
