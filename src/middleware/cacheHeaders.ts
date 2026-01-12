import { Request, Response, NextFunction } from "express";

/**
 * Middleware para agregar headers de caché HTTP a las respuestas
 * Especialmente útil para respuestas que contienen URLs de imágenes
 */
export const cacheHeaders = (maxAge: number = 300) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // No cachear endpoints sensibles de autenticación / datos de usuario
    const url = req.originalUrl || req.url || "";
    const isAuthOrUserEndpoint =
      url.startsWith("/api/auth") || url.startsWith("/api/users");

    if (isAuthOrUserEndpoint) {
      res.set({
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        Pragma: "no-cache",
      });
      return next();
    }

    // Agregar headers de caché para el resto de las respuestas
    res.set({
      "Cache-Control": `public, max-age=${maxAge}, stale-while-revalidate=600`,
      ETag: `"${Date.now()}"`, // ETag simple basado en timestamp
    });

    next();
  };
};

/**
 * Headers específicos para imágenes
 * Las imágenes pueden cachearse por más tiempo ya que cambian menos frecuentemente
 */
export const imageCacheHeaders = (req: Request, res: Response, next: NextFunction) => {
  res.set({
    'Cache-Control': 'public, max-age=31536000, immutable', // 1 año para imágenes
  });
  
  next();
};

