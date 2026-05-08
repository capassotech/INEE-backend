import { z } from 'zod';

export const PaypalOrderItemSchema = z.object({
    description: z.string()
        .min(1, "La descripción es obligatoria")
        .max(500, "La descripción no puede exceder 500 caracteres")
        .trim(),
    id: z.string()
        .min(1, "El ID del producto es obligatorio")
        .max(100, "El ID no puede exceder 100 caracteres")
        .trim(),
    picture_url: z.string()
        .min(1, "La URL de la imagen es obligatoria")
        .max(2000, "La URL no puede exceder 2000 caracteres")
        .trim(),
    quantity: z.number()
        .int("La cantidad debe ser un número entero")
        .min(1, "La cantidad debe ser al menos 1")
        .max(1000, "La cantidad no puede exceder 1000 unidades"),
    title: z.string()
        .min(1, "El título es obligatorio")
        .max(200, "El título no puede exceder 200 caracteres")
        .trim(),
    unit_price: z.number()
        .min(0, "El precio unitario no puede ser negativo")
        .max(9999999, "El precio unitario no puede exceder $9.999.999"),
});

export const CreatePaypalOrderSchema = z.object({
    userId: z.string()
        .min(1, "El ID del usuario es obligatorio")
        .max(100, "El ID del usuario no puede exceder 100 caracteres")
        .trim(),
    items: z.array(PaypalOrderItemSchema)
        .min(1, "Debe incluir al menos un item")
        .max(100, "No puede tener más de 100 items"),
    totalPrice: z.number()
        .min(0, "El precio total no puede ser negativo")
        .max(99999999, "El precio total no puede exceder $99.999.999"),
    discountCode: z.string()
        .min(1, "El código de descuento no puede estar vacío")
        .max(50, "El código de descuento no puede exceder 50 caracteres")
        .trim()
        .optional(),
    originalPrice: z.number()
        .min(0, "El precio original no puede ser negativo")
        .max(99999999, "El precio original no puede exceder $99.999.999")
        .optional(),
});

export type PaypalOrderItem = z.infer<typeof PaypalOrderItemSchema>;
export type CreatePaypalOrderDto = z.infer<typeof CreatePaypalOrderSchema>;
