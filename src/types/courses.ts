
import { z } from 'zod';

export interface Course {
    titulo: string;
    descripcion: string;
    duracion: number;
    nivel: NivelCurso;
    modalidad: ModalidadCurso;
    pilar: TipoPilar;
    precio: number;
    imagen: string;
    id_profesor: string | string[];  // Soporta uno o múltiples profesores
    estado: EstadoCurso;
    tags: string[];
    id_modulos: string[];
}

export enum NivelCurso {
    PRINCIPIANTE = "principiante",
    INTERMEDIO = "intermedio",
    AVANZADO = "avanzado",
}

export enum ModalidadCurso {
    VIRTUAL = "virtual",
    PRESENCIAL = "presencial",
    ON_DEMAND = "on-demand",
}

export enum EstadoCurso {
    ACTIVO = "activo",
    INACTIVO = "inactivo",
}

export enum TipoPilar {
    CONSULTORIA_ESTRATEGICA = "consultoria-estrategica",
    LIDERAZGO = "liderazgo",
    EMPRENDIMIENTO = "emprendimiento",
}

export const CourseSchema = z.object({
    titulo: z.string()
        .min(1, "El título del curso es obligatorio")
        .max(200, "El título no puede exceder 200 caracteres")
        .trim(),
    descripcion: z.string()
        .min(1, "La descripción del curso es obligatoria")
        .max(3000, "La descripción no puede exceder 3000 caracteres")
        .trim(),
    duracion: z.number()
        .int("La duración debe ser un número entero")
        .min(1, "La duración debe ser al menos 1 semana")
        .max(52, "La duración no puede exceder 52 semanas (1 año)"),
    nivel: z.enum(NivelCurso),
    modalidad: z.enum(ModalidadCurso),
    pilar: z.enum(TipoPilar),
    precio: z.number()
        .min(0, "El precio no puede ser negativo")
        .max(999999, "El precio no puede exceder $999,999"),
    imagen: z.string().optional(),
    id_profesor: z.union([
        z.string()
            .min(1, "El ID del profesor es obligatorio")
            .max(100, "El ID del profesor no puede exceder 100 caracteres")
            .trim(),
        z.array(z.string()
            .min(1, "El ID del profesor no puede estar vacío")
            .max(100, "El ID del profesor no puede exceder 100 caracteres")
            .trim())
            .min(1, "Debe incluir al menos un profesor")
            .max(10, "No puede tener más de 10 profesores")
    ]),
    estado: z.enum(EstadoCurso),
    tags: z.array(z.string()
        .min(1, "Los tags no pueden estar vacíos"))
        .max(20, "No puede tener más de 20 tags"),
    id_modulos: z.array(z.string()
        .min(1, "Los IDs de módulos no pueden estar vacíos"))
        .max(50, "No puede tener más de 50 módulos"),
    aval: z.object({
        titulo: z.string()
            .min(1, "El título de la aval es obligatorio")
            .max(200, "El título no puede exceder 200 caracteres")
            .trim(),
        descripcion: z.string()
            .min(1, "La descripción de la aval es obligatoria")
            .max(2000, "La descripción no puede exceder 2000 caracteres")
            .trim(),
        precio: z.number()
            .min(0, "El precio no puede ser negativo")
            .max(999999, "El precio no puede exceder $999,999"),
        archivo: z.string()
            .min(1, "La URL del archivo es obligatoria")
            .max(2000, "La URL no puede exceder 2000 caracteres")
            .trim(),
    })
});

export const UpdateCourseSchema = CourseSchema.partial();

export type ValidatedCourse = z.infer<typeof CourseSchema>;
export type ValidatedUpdateCourse = z.infer<typeof UpdateCourseSchema>;