import { z } from "zod";

export const ReviewCreateSchema = z.object({
  courseId: z.string().min(1, "El ID del curso es requerido"),
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional(),
});

export type ValidatedCreateReview = z.infer<typeof ReviewCreateSchema>;