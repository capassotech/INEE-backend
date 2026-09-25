import { Request, Response, NextFunction } from "express";

const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET_KEY;
const MIN_SCORE = 0.5;

export const verifyRecaptcha = async (req: Request, res: Response, next: NextFunction) => {
  const token = req.body.recaptchaToken;

  if (!token) {
    return res.status(400).json({ message: "Token de seguridad requerido" });
  }

  try {
    const response = await fetch(
      `https://www.google.com/recaptcha/api/siteverify?secret=${RECAPTCHA_SECRET}&response=${token}`,
      { method: "POST" }
    );
    const data = await response.json() as { success: boolean; score: number; action: string };

    if (!data.success || data.score < MIN_SCORE) {
      return res.status(400).json({ message: "Verificación de seguridad fallida" });
    }

    next();
  } catch {
    return res.status(500).json({ message: "Error al verificar seguridad" });
  }
};
