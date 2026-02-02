// types/ebooks.ts
import { z } from "zod";

export const EbookCreateSchema = z.object({
  title: z.string().min(1, "El título es obligatorio"),
  description: z.string().min(1, "La descripción es obligatoria"),
  author: z.string().min(1, "El autor es obligatorio"),
  precio: z.number()
    .min(0, "El precio no puede ser negativo")
    .max(9999999, "El precio no puede exceder $9.999.999"),
  precio_anterior: z.number()
    .min(0, "El precio anterior no puede ser negativo")
    .max(9999999, "El precio anterior no puede exceder $9.999.999")
    .optional(),
  cuotas: z
    .preprocess(
      (val) => {
        // Convertir objetos vacíos a null para que se pueda eliminar en actualizaciones
        if (val && typeof val === "object" && Object.keys(val).length === 0) {
          return null;
        }
        return val;
      },
      z
        .union([
          z.null(),
          z.object({
            cantidad_cuotas: z.number()
              .int("La cantidad de cuotas debe ser un número entero")
              .min(1, "La cantidad de cuotas debe ser al menos 1")
              .max(12, "La cantidad de cuotas no puede exceder 12"),
            monto_cuota: z.number()
              .min(0, "El monto por cuota no puede ser negativo")
              .max(9999999, "El monto por cuota no puede exceder $9.999.999"),
          }),
        ])
        .optional()
        .nullable()
    ),
  archivoUrl: z.string().min(1, "El archivo es obligatorio"),
  pilares: z.string().min(1, "Los pilares son obligatorios"),
  temas: z.array(z.string()).optional().default([]),
  tags: z.array(z.string()).optional().default([]),
  estado: z.enum(["activo", "inactivo"], {
    message: "El estado debe ser 'activo' o 'inactivo'",
  }),
  imagen: z.string().optional(),
  // Campo legacy para compatibilidad
  price: z.number().optional(),
});

// Schema de actualización - todos los campos opcionales
// Usamos .partial() pero con validación condicional para campos que se envían
export const EbookUpdateSchema = z
  .object({
    title: z
      .preprocess(
        (val) => (val === "" ? undefined : val),
        z.string().min(1, "El título es obligatorio")
      )
      .optional(),
    description: z
      .preprocess(
        (val) => (val === "" ? undefined : val),
        z.string().min(1, "La descripción es obligatoria")
      )
      .optional(),
    author: z
      .preprocess(
        (val) => (val === "" ? undefined : val),
        z.string().min(1, "El autor es obligatorio")
      )
      .optional(),
    precio: z
      .number()
      .min(0, "El precio no puede ser negativo")
      .max(9999999, "El precio no puede exceder $9.999.999")
      .optional(),
    precio_anterior: z
      .number()
      .min(0, "El precio anterior no puede ser negativo")
      .max(9999999, "El precio anterior no puede exceder $9.999.999")
      .nullable()
      .optional(),
    cuotas: z
      .preprocess(
        (val) => {
          // Convertir objetos vacíos a null antes de validar
          if (val && typeof val === "object" && !Array.isArray(val) && Object.keys(val).length === 0) {
            return null;
          }
          return val;
        },
        z.union([
          z.null(),
          z.object({
            cantidad_cuotas: z.number()
              .int("La cantidad de cuotas debe ser un número entero")
              .min(1, "La cantidad de cuotas debe ser al menos 1")
              .max(12, "La cantidad de cuotas no puede exceder 12"),
            monto_cuota: z.number()
              .min(0, "El monto por cuota no puede ser negativo")
              .max(9999999, "El monto por cuota no puede exceder $9.999.999"),
          }),
        ])
      ),
    archivoUrl: z
      .preprocess(
        (val) => (val === "" ? undefined : val),
        z.string().min(1, "El archivo es obligatorio")
      )
      .optional(),
    pilares: z
      .preprocess(
        (val) => (val === "" ? undefined : val),
        z.string().min(1, "Los pilares son obligatorios")
      )
      .optional(),
    temas: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    estado: z
      .enum(["activo", "inactivo"], {
        message: "El estado debe ser 'activo' o 'inactivo'",
      })
      .optional(),
    imagen: z.string().nullable().optional(),
    price: z.number().optional(),
  })
  .partial();

export type ValidatedCreateEbook = z.infer<typeof EbookCreateSchema>;
export type ValidatedUpdateEbook = z.infer<typeof EbookUpdateSchema>;
