import { z } from "zod";

export const MercadoPagoAccountCreateSchema = z.object({
  nombreFantasia: z.string().min(1, "El nombre fantasia es obligatorio").trim(),
  accessToken: z.string().min(1, "El access token es obligatorio").trim(),
  publicKey: z.string().min(1, "La public key es obligatoria").trim(),
  activa: z.boolean().optional().default(true),
});

export const MercadoPagoAccountUpdateSchema = MercadoPagoAccountCreateSchema.partial();

export type ValidatedCreateMercadoPagoAccount = z.infer<typeof MercadoPagoAccountCreateSchema>;
export type ValidatedUpdateMercadoPagoAccount = z.infer<typeof MercadoPagoAccountUpdateSchema>;

export interface MercadoPagoAccount {
  id: string;
  nombreFantasia: string;
  accessToken: string;
  publicKey: string;
  activa: boolean;
  createdAt?: string;
  updatedAt?: string;
}
