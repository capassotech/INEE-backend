import { z } from 'zod';

// Nota: MembershipState ya no se usa en actualización, pero lo dejamos por si se usa en lectura
export enum MembershipState {
  ACTIVO = "activo",
  INACTIVO = "inactivo",
}

// Solo usamos este esquema para creación (aunque no expones POST, puede servir internamente)
const membershipBaseSchemaForCreation = {
  nombre: z.string()
    .min(3, "El nombre debe tener al menos 3 caracteres")
    .max(100, "El nombre no puede exceder 100 caracteres")
    .regex(/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\d\s\-._]+$/, "El nombre solo puede contener letras, números, espacios, guiones, puntos y guiones bajos")
    .transform(str => str.trim())
    .optional(),
  descripcion: z.string()
    .min(10, "La descripción debe tener al menos 10 caracteres")
    .max(500, "La descripción no puede exceder 500 caracteres")
    .transform(str => str.trim()),

  precio: z.number()
    .positive("El precio debe ser mayor a 0")
    .max(999999, "El precio no puede exceder $999,999")
    .transform(val => Math.round(val * 100) / 100),

  informacionAdicional: z.string()
    .min(10, "La información adicional debe tener al menos 10 caracteres")
    .max(1000, "La información adicional no puede exceder 1000 caracteres")
    .transform(str => str.trim()),

  // Estos campos solo aplican a creación (aunque no expones el endpoint)
  duracion: z.number()
    .int("La duración debe ser un número entero")
    .positive("La duración debe ser mayor a 0")
    .max(365, "La duración no puede exceder 365 días"),

  estado: z.enum(MembershipState),
};

// ✅ Esquema de ACTUALIZACIÓN: SOLO los 4 campos permitidos
export const UpdateMembershipSchema = z.object({
  nombre: z.string()
    .min(3, "El nombre debe tener al menos 3 caracteres")
    .max(100, "El nombre no puede exceder 100 caracteres")
    .regex(/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\d\s\-._]+$/, "El nombre solo puede contener letras, números, espacios, guiones, puntos y guiones bajos")
    .transform(str => str.trim())
    .optional(),

  descripcion: z.string()
    .min(10, "La descripción debe tener al menos 10 caracteres")
    .max(500, "La descripción no puede exceder 500 caracteres")
    .transform(str => str.trim())
    .optional(),

  precio: z.number()
    .positive("El precio debe ser mayor a 0")
    .max(999999, "El precio no puede exceder $999,999")
    .transform(val => Math.round(val * 100) / 100)
    .optional(),

  informacionAdicional: z.string()
    .min(10, "La información adicional debe tener al menos 10 caracteres")
    .max(1000, "La información adicional no puede exceder 1000 caracteres")
    .transform(str => str.trim())
    .optional(),
})
  .refine(data => {
    return Object.values(data).some(value => value !== undefined);
  }, {
    message: "Debe proporcionar al menos un campo para actualizar"
  });

// Si aún necesitas el esquema de creación (aunque no lo expongas):
export const CreateMembershipSchema = z.object({
  ...membershipBaseSchemaForCreation,
  fechaAlta: z.coerce.date()
    .refine(date => date <= new Date(), {
      message: "La fecha de alta no puede ser en el futuro"
    })
    .refine(date => date >= new Date('2020-01-01'), {
      message: "La fecha de alta no puede ser anterior al año 2020"
    })
});

export const MembershipIdSchema = z.object({
  id: z.string()
    .min(1, "ID es requerido")
    .max(50, "ID inválido")
});

// Tipos
export type MembershipCreationData = z.infer<typeof CreateMembershipSchema>;
export type MembershipUpdateData = z.infer<typeof UpdateMembershipSchema>;
export type MembershipId = z.infer<typeof MembershipIdSchema>;