import { z } from 'zod';

const cuotasObjectSchema = z.object({
    cantidad_cuotas: z.number()
        .int('La cantidad de cuotas debe ser un número entero')
        .min(1, 'La cantidad de cuotas debe ser al menos 1')
        .max(12, 'La cantidad de cuotas no puede exceder 12'),
    monto_cuota: z.number()
        .min(0, 'El monto por cuota no puede ser negativo')
        .max(9999999, 'El monto por cuota no puede exceder $9.999.999'),
});

const normalizeCuotasInput = (val: unknown): unknown => {
    if (val === undefined) return undefined;
    if (val === null) return null;

    if (typeof val === 'object' && !Array.isArray(val)) {
        const obj = val as Record<string, unknown>;

        if (Object.keys(obj).length === 0) return null;

        const cantidad = obj.cantidad_cuotas;
        const monto = obj.monto_cuota;
        const hasCantidad = cantidad !== undefined && cantidad !== null && cantidad !== '';
        const hasMonto = monto !== undefined && monto !== null && monto !== '';

        if (!hasCantidad && !hasMonto) return null;
    }

    return val;
};

/** Cuotas opcionales: acepta omitir, null, {} o campos vacíos sin error de validación. */
export const optionalCuotasSchema = z.preprocess(
    normalizeCuotasInput,
    z.union([z.null(), cuotasObjectSchema]).optional().nullable()
);
