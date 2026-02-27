import { z } from "zod";

export const RecomendacionCreateSchema = z.object({
  titulo: z.string().min(1, "El título es obligatorio").trim(),
  descripcion: z.string().min(1, "La descripción es obligatoria").trim(),
});

export const RecomendacionUpdateSchema = RecomendacionCreateSchema.partial();

export type ValidatedCreateRecomendacion = z.infer<typeof RecomendacionCreateSchema>;
export type ValidatedUpdateRecomendacion = z.infer<typeof RecomendacionUpdateSchema>;

export interface Recomendacion {
  id: string;
  titulo: string;
  descripcion: string;
  createdAt: Date | FirebaseFirestore.Timestamp;
  updatedAt: Date | FirebaseFirestore.Timestamp;
}
