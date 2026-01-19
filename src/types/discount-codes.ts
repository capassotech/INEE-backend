import { z } from "zod";

export interface DiscountCode {
  id: string;
  codigo: string;
  porcentaje: number; // 0-100
  createdAt?: string;
  updatedAt?: string;
}

export const DiscountCodeCreateSchema = z.object({
  codigo: z
    .string()
    .min(1, "El código es obligatorio")
    .max(100, "El código no puede exceder 100 caracteres")
    .trim(),
  porcentaje: z
    .number()
    .min(0, "El porcentaje no puede ser menor a 0")
    .max(100, "El porcentaje no puede ser mayor a 100"),
});

export const DiscountCodeUpdateSchema = DiscountCodeCreateSchema.partial();

export type ValidatedCreateDiscountCode = z.infer<typeof DiscountCodeCreateSchema>;
export type ValidatedUpdateDiscountCode = z.infer<typeof DiscountCodeUpdateSchema>;

