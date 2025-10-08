import { z } from 'zod';

enum EstadoEbook {
    ACTIVO = 'activo',
    INACTIVO = 'inactivo',
    BORRADOR = 'borrador',
}

export const EbookCreateSchema = z.object({
    title: z.string().min(1, "El título del ebook es obligatorio"),
    author: z.string().min(1, "El autor del ebook es obligatorio"),
    description: z.string().optional(),
    price: z.number().optional(),
    estado: z.enum(EstadoEbook).optional(),
    pilares: z.string().optional(),
    archivoUrl: z.string().optional(),
    temas: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
});

export type ValidatedCreateEbook = z.infer<typeof EbookCreateSchema>;

export const EbookUpdateSchema = z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    author: z.string().optional(),
    price: z.number().optional(),
    estado: z.enum(EstadoEbook).optional(),
    pilares: z.string().optional(),
    archivoUrl: z.string().optional(),
    temas: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
}); 

export type ValidatedUpdateEbook = z.infer<typeof EbookUpdateSchema>;