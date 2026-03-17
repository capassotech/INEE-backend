import { z } from "zod";

export const MercadoPagoAccountUpdateActivoSchema = z.object({
  activo: z.boolean(),
});

export type ValidatedUpdateMercadoPagoAccountActivo = z.infer<
  typeof MercadoPagoAccountUpdateActivoSchema
>;

export interface MercadoPagoAccount {
  id: string;
  titulo: string;
  activo: boolean;
}
