// types/avales.ts
import { z } from "zod";

export const AvalCreateSchema = z.object({
  nombre: z.string().min(1, "El nombre es obligatorio"),
  descripcion: z.string().optional(),
  precio: z.number()
    .min(0, "El precio no puede ser negativo")
    .max(9999999, "El precio no puede exceder $9.999.999")
    .optional(),
  archivo: z.string()
    .min(1, "La URL del archivo es obligatoria")
    .max(2000, "La URL no puede exceder 2000 caracteres")
    .trim(),
  codigo: z.string().optional(),
  activo: z.boolean().optional().default(true),
});

export const AvalUpdateSchema = AvalCreateSchema.partial();

export type ValidatedCreateAval = z.infer<typeof AvalCreateSchema>;
export type ValidatedUpdateAval = z.infer<typeof AvalUpdateSchema>;

export interface Aval {
  id: string;
  nombre: string;
  descripcion?: string;
  precio?: number;
  archivo: string;
  codigo?: string;
  activo?: boolean;
  createdAt: Date | FirebaseFirestore.Timestamp;
  updatedAt: Date | FirebaseFirestore.Timestamp;
}
