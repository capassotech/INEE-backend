// types/ebooks.ts
import { z } from "zod";

export const EbookCreateSchema = z.object({
  title: z.string().min(1, "El título es obligatorio"),
  description: z.string().min(1, "La descripción es obligatoria"),
  author: z.string().min(1, "El autor es obligatorio"),
  price: z.number().min(0.01, "El precio debe ser mayor que 0"),
  estado: z.enum(["activo", "inactivo"]),
  pilares: z.string().min(1, "Los pilares son obligatorios"),
  archivoUrl: z.string().min(1, "El archivo es obligatorio"), 
  temas: z.array(z.string()).min(1, "Los temas son obligatorios"), 
  tags: z.array(z.string()).optional(), 
  imagen: z.string().optional(), 
});

export const EbookUpdateSchema = EbookCreateSchema.partial();

export type ValidatedCreateEbook = z.infer<typeof EbookCreateSchema>;
export type ValidatedUpdateEbook = z.infer<typeof EbookUpdateSchema>;