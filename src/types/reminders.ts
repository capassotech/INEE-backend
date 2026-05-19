import { z } from 'zod';

export const CreatePaypalProofReminderSchema = z.object({
    userId: z.string()
        .min(1, 'El ID del usuario es obligatorio')
        .max(100, 'El ID del usuario no puede exceder 100 caracteres')
        .trim(),
    orderNumber: z.string()
        .min(1, 'El número de orden es obligatorio')
        .max(50, 'El número de orden no puede exceder 50 caracteres')
        .trim(),
});

export type CreatePaypalProofReminderDto = z.infer<typeof CreatePaypalProofReminderSchema>;
