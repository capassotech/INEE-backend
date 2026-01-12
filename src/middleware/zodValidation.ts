import { Request, Response, NextFunction } from "express";
import { z } from "zod";

export type ValidationTarget = "body" | "params" | "query";

export const validateSchema = (
  schema: z.ZodSchema,
  target: ValidationTarget = "body"
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const dataToValidate = req[target];

      const validatedData = schema.parse(dataToValidate);

      (req as any)[target] = validatedData;

      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const formattedErrors = error.issues.map((err: any) => ({
          field: err.path.join("."),
          message: err.message,
          code: err.code,
        }));

        return res.status(400).json({
          error: "Datos de entrada inválidos",
          details: formattedErrors,
          summary: formattedErrors.map((err: any) => err.message),
        });
      }

      console.error("Error inesperado en validación:", error);
      return res.status(500).json({
        error: "Error interno del servidor durante la validación",
      });
    }
  };
};

export const validateBody = (schema: z.ZodSchema) =>
  validateSchema(schema, "body");

export const validateParams = (schema: z.ZodSchema) =>
  validateSchema(schema, "params");

export const validateQuery = (schema: z.ZodSchema) =>
  validateSchema(schema, "query");

export const validateMultiple = (validations: {
  body?: z.ZodSchema;
  params?: z.ZodSchema;
  query?: z.ZodSchema;
}) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors: Array<{ target: string; field: string; message: string }> =
        [];

      // Validar cada parte especificada
      for (const [target, schema] of Object.entries(validations)) {
        if (schema) {
          try {
            const validatedData = schema.parse(req[target as ValidationTarget]);
            (req as any)[target] = validatedData;
          } catch (error) {
            if (error instanceof z.ZodError) {
              errors.push(
                ...error.issues.map((err: any) => ({
                  target,
                  field: err.path.join("."),
                  message: err.message,
                }))
              );
            }
          }
        }
      }

      if (errors.length > 0) {
        return res.status(400).json({
          error: "Datos de entrada inválidos",
          details: errors,
          summary: errors.map(
            (err: any) => `${err.target}.${err.field}: ${err.message}`
          ),
        });
      }

      next();
    } catch (error) {
      console.error("Error inesperado en validación múltiple:", error);
      return res.status(500).json({
        error: "Error interno del servidor durante la validación",
      });
    }
  };
};

export const basicSanitization = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const sanitizeString = (str: string): string => {
    // Preservar saltos de línea (\n = 0x0A, \r = 0x0D) pero eliminar otros caracteres de control peligrosos
    // \x00-\x09: caracteres de control (excepto \n y \r)
    // \x0A: \n (preservar)
    // \x0B-\x0C: caracteres de control (excepto \r)
    // \x0D: \r (preservar)
    // \x0E-\x1F: caracteres de control
    // \x7F-\x9F: caracteres de control extendidos
    // Usar trim personalizado que solo elimina espacios y tabs, no saltos de línea
    const trimmed = str.replace(/^[ \t]+|[ \t]+$/g, '').replace(/[\x00-\x09\x0B-\x0C\x0E-\x1F\x7F-\x9F]/g, "");
    if (trimmed.startsWith("data:image/") || trimmed.startsWith("data:application/")) {
      return trimmed;
    }
    return trimmed.slice(0, 10000);
  };

  const sanitizeObject = (obj: any): any => {
    if (typeof obj === "string") {
      return sanitizeString(obj);
    }
    if (typeof obj === "object" && obj !== null && !Array.isArray(obj)) {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        if (typeof key === "string" && key.length < 100) {
          sanitized[key] = sanitizeObject(value);
        }
      }
      return sanitized;
    }
    return obj;
  };

  if (req.body && typeof req.body === "object") {
    req.body = sanitizeObject(req.body);
  }

  next();
};
