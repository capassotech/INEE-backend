import { z } from 'zod';

export interface Event {
  titulo: string;
  descripcion: string;
  fecha: Date;
  hora: string;
  modalidad: string;
  precio: number;
  // MEMBRESÍAS DESACTIVADAS - Comentado para posible reactivación futura
  // membresiaId?: string | null;
  imagen?: string;
}

export const EventCreateSchema = z.object({
  titulo: z.string().min(1),
  descripcion: z.string().min(1),
  fecha: z.preprocess((v) => (typeof v === 'string' || v instanceof Date ? new Date(v as any) : v), z.date()),
  hora: z.string().min(1),
  modalidad: z.string().min(1),
  precio: z.number(),
  // MEMBRESÍAS DESACTIVADAS - Comentado para posible reactivación futura
  // membresiaId: z.string().nullable().optional(),
  imagen: z.union([z.string(), z.null()]).optional(),
  estado: z.enum(['activo', 'inactivo']).optional(),
});

export const EventUpdateSchema = EventCreateSchema.partial();

export type ValidatedCreateEvent = z.infer<typeof EventCreateSchema>;
export type ValidatedUpdateEvent = z.infer<typeof EventUpdateSchema>;