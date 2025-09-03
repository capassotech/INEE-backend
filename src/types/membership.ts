
import { z } from 'zod';

export enum MembershipState {
  ACTIVO = "activo",
  INACTIVO = "inactivo",
}

const membershipBaseSchema = {
  nombre: z.string()
    .min(3, "El nombre debe tener al menos 3 caracteres")
    .max(100, "El nombre no puede exceder 100 caracteres")
    .regex(/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s\-._]+$/, "El nombre solo puede contener letras, espacios, guiones, puntos y guiones bajos")
    .transform(str => str.trim()),
  
  descripcion: z.string()
    .min(10, "La descripción debe tener al menos 10 caracteres")
    .max(500, "La descripción no puede exceder 500 caracteres")
    .transform(str => str.trim()),
  
  precio: z.number()
    .positive("El precio debe ser mayor a 0")
    .max(999999, "El precio no puede exceder $999,999")
    .transform(val => Math.round(val * 100) / 100),
  
  duracion: z.number()
    .int("La duración debe ser un número entero")
    .positive("La duración debe ser mayor a 0")
    .max(365, "La duración no puede exceder 365 días"),
  
  estado: z.enum(MembershipState)
};

export const CreateMembershipSchema = z.object({
  ...membershipBaseSchema,
  fechaAlta: z.coerce.date()
    .refine(date => date <= new Date(), {
      message: "La fecha de alta no puede ser en el futuro"
    })
    .refine(date => date >= new Date('2020-01-01'), {
      message: "La fecha de alta no puede ser anterior al año 2020"
    })
});

export const UpdateMembershipSchema = z.object({
  nombre: membershipBaseSchema.nombre.optional(),
  descripcion: membershipBaseSchema.descripcion.optional(),
  precio: membershipBaseSchema.precio.optional(),
  duracion: membershipBaseSchema.duracion.optional(),
  estado: membershipBaseSchema.estado.optional(),
  fechaAlta: z.coerce.date()
    .refine(date => date <= new Date(), {
      message: "La fecha de alta no puede ser en el futuro"
    })
    .refine(date => date >= new Date('2020-01-01'), {
      message: "La fecha de alta no puede ser anterior al año 2020"
    })
    .optional()
}).refine(data => {
  return Object.values(data).some(value => value !== undefined);
}, {
  message: "Debe proporcionar al menos un campo para actualizar"
});

export const MembershipIdSchema = z.object({
  id: z.string()
    .min(1, "ID es requerido")
    .max(50, "ID inválido")
});

export type MembershipCreationData = z.infer<typeof CreateMembershipSchema>;
export type MembershipUpdateData = z.infer<typeof UpdateMembershipSchema>;
export type MembershipId = z.infer<typeof MembershipIdSchema>;
