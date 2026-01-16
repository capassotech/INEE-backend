import { z } from 'zod';

export interface Event {
  titulo: string;
  descripcion: string;
  fecha: Date | string;
  hora?: string;
  modalidad: "presencial" | "virtual" | "hibrida";
  precio_actual: number;
  precio_anterior?: number;
  cuotas?: {
    monto_cuota: number;
    cantidad_cuotas: number;
  };
  membresiaId?: string | null;
  tipo?: string;
  estado: "activo" | "inactivo";
  imagen?: string;
}

export const EventCreateSchema = z.object({
  titulo: z.string().min(1, "El título es obligatorio"),
  descripcion: z.string().min(1, "La descripción es obligatoria"),
  fecha: z.preprocess(
    (v) => (typeof v === 'string' || v instanceof Date ? new Date(v as any) : v),
    z.date()
  ),
  hora: z.string()
    .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "El formato de hora debe ser HH:mm (ej: 14:30)")
    .optional(),
  modalidad: z.enum(["presencial", "virtual", "hibrida"], {
    message: "La modalidad debe ser 'presencial', 'virtual' o 'hibrida'",
  }),
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
  membresiaId: z.union([z.string(), z.null()]).optional(),
  tipo: z.string().optional(),
  estado: z.enum(["activo", "inactivo"], {
    message: "El estado debe ser 'activo' o 'inactivo'",
  }),
  imagen: z.union([z.string(), z.null()]).optional(),
  // Campos legacy para compatibilidad
  price: z.number().optional(),
  precio: z.number().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  date: z.string().optional(),
  image: z.string().optional(),
});

export const EventUpdateSchema = EventCreateSchema.partial();

export type ValidatedCreateEvent = z.infer<typeof EventCreateSchema>;
export type ValidatedUpdateEvent = z.infer<typeof EventUpdateSchema>;
