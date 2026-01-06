import { z } from 'zod';

export interface Event {
  titulo: string;
  descripcion: string;
  fecha: Date;
  hora: string;
  modalidad: string;
  precio: number;
  membresiaId?: string | null;
  imagen?: string;
}

export const EventCreateSchema = z.object({
  titulo: z.string().min(1),
  descripcion: z.string().min(1),
  fecha: z.preprocess((v) => (typeof v === 'string' || v instanceof Date ? new Date(v as any) : v), z.date()),
  hora: z.string().min(1),
  modalidad: z.string().min(1),
  precio: z.number(),
  membresiaId: z.string().nullable().optional(),
  imagen: z.union([z.string(), z.null()]).optional(),
});

export const EventUpdateSchema = EventCreateSchema.partial();

export type ValidatedCreateEvent = z.infer<typeof EventCreateSchema>;
export type ValidatedUpdateEvent = z.infer<typeof EventUpdateSchema>;