// types/ebooks.ts
import { z } from "zod";

export const EbookCreateSchema = z.object({
  title: z.string().min(1, "El título es obligatorio"),
  description: z.string().min(1, "La descripción es obligatoria"),
  author: z.string().min(1, "El autor es obligatorio"),
  precio_actual: z.number()
    .min(0, "El precio actual no puede ser negativo")
    .max(999999, "El precio actual no puede exceder $999,999"),
  precio_anterior: z.number()
    .min(0, "El precio anterior no puede ser negativo")
    .max(999999, "El precio anterior no puede exceder $999,999")
    .optional(),
  cuotas: z.object({
    cantidad_cuotas: z.number()
      .int("La cantidad de cuotas debe ser un número entero")
      .min(1, "La cantidad de cuotas debe ser al menos 1")
      .max(12, "La cantidad de cuotas no puede exceder 12"),
    monto_cuota: z.number()
      .min(0, "El monto por cuota no puede ser negativo")
      .max(999999, "El monto por cuota no puede exceder $999,999"),
  }).optional(),
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

export const EbookUpdateSchema = EbookCreateSchema.partial();

export type ValidatedCreateEbook = z.infer<typeof EbookCreateSchema>;
export type ValidatedUpdateEbook = z.infer<typeof EbookUpdateSchema>;
