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

const coerceOptionalNumber = (val: unknown): number | undefined => {
    if (val === undefined || val === null) return undefined;
    if (typeof val === 'string' && val.trim() === '') return undefined;
    if (typeof val === 'number' && !Number.isNaN(val)) return val;
    if (typeof val === 'string') {
        const parsed = Number(val.trim());
        if (!Number.isNaN(parsed)) return parsed;
    }
    return undefined;
};

const normalizeCuotasInput = (val: unknown): unknown => {
    if (val === undefined) return undefined;
    if (val === null) return null;
    if (val === '' || val === 'null') return null;

    if (typeof val !== 'object' || Array.isArray(val)) return null;

    const obj = val as Record<string, unknown>;

    if (Object.keys(obj).length === 0) return null;

    const cantidad = coerceOptionalNumber(obj.cantidad_cuotas);
    const monto = coerceOptionalNumber(obj.monto_cuota);

    // Sin cuotas o datos incompletos → no exigir campos al editar/crear
    if (cantidad === undefined && monto === undefined) return null;
    if (cantidad === undefined || monto === undefined) return null;

    return { cantidad_cuotas: cantidad, monto_cuota: monto };
};


export const optionalCuotasSchema = z.preprocess(
    normalizeCuotasInput,
    z.union([z.null(), cuotasObjectSchema]).optional().nullable()
);
