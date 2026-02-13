
import { z } from 'zod';

export interface Course {
    titulo: string;
    descripcion: string;
    duracion: number;
    nivel: NivelCurso;
    modalidad: ModalidadCurso;
    pilar: TipoPilar;
    precio: number;
    precio_anterior?: number;
    cuotas?: {
        monto_cuota: number;
        cantidad_cuotas: number;
    };
    imagen: string;
    id_profesor: string | string[];  // Soporta uno o múltiples profesores
    estado: EstadoCurso;
    tags: string[];
    id_modulos: string[];
    id_avales?: string[];  // Array de IDs de avales
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
    descripcion_corta: z.string()
        .min(1, "La descripción corta del curso es obligatoria")
        .max(200, "La descripción corta no puede exceder 200 caracteres")
        .trim(),
    // descripcion_larga: z.string()
    //     .min(1, "El sobre del curso es obligatorio")
    //     .max(2000, "El sobre del curso no puede exceder 2000 caracteres")
    //     .trim(),
    metas: z.array(z.string())
        .min(1, "Las metas son obligatorias"),
    aprendizaje: z.array(z.string())
        .min(1, "Los aprendizajes son obligatorios"),
    dirigida_a: z.array(z.string())
        .min(1, "La dirigida a es obligatoria"),
    duracion: z.number()
        .int("La duración debe ser un número entero")
        .min(1, "La duración debe ser al menos 1 semana")
        .max(52, "La duración no puede exceder 52 semanas (1 año)"),
    nivel: z.enum(["principiante", "intermedio", "avanzado"], {
        message: "Selecciona un nivel válido",
    }),
    modalidad: z.enum(["presencial", "virtual", "on-demand"], {
        message: "Selecciona una modalidad válida",
    }),
    pilar: z.enum(["liderazgo", "consultoria-estrategica", "emprendimiento"], {
        message: "Selecciona un pilar válido",
    }),
    estado: z.enum(["activo", "inactivo"], {
        message: "Selecciona un estado válido",
    }),
    precio: z.number()
        .min(0, "El precio no puede ser negativo")
        .max(9999999, "El precio no puede exceder $9.999.999"),
    precio_anterior: z.number()
        .min(0, "El precio anterior no puede ser negativo")
        .max(9999999, "El precio anterior no puede exceder $9.999.999")
        .optional(),
    cuotas: z.object({
        cantidad_cuotas: z.number()
            .int("La cantidad de cuotas debe ser un número entero")
            .min(1, "La cantidad de cuotas debe ser al menos 1")
            .max(12, "La cantidad de cuotas no puede exceder 12"),
        monto_cuota: z.number()
            .min(0, "El monto por cuota no puede ser negativo")
            .max(9999999, "El monto por cuota no puede exceder $9.999.999"),
    }).optional(),
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
    id_modulos: z.array(z.string()
        .min(1, "Los IDs de módulos no pueden estar vacíos"))
        .max(50, "No puede tener más de 50 módulos"),
    tags: z.array(z.string()
        .min(1, "Los tags no pueden estar vacíos"))
        .max(20, "No puede tener más de 20 tags"),
    id_avales: z.array(z.string()
        .min(1, "Los IDs de avales no pueden estar vacíos"))
        .max(50, "No puede tener más de 50 avales")
        .optional(),
    // Campo legacy para compatibilidad
    descripcion: z.string().optional(),
    // Campo legacy para compatibilidad con el antiguo formato de aval
    aval: z.object({
        titulo: z.string()
            .min(1, "El título de la aval es obligatorio")
            .max(200, "El título no puede exceder 200 caracteres")
            .trim(),
        descripcion: z.string()
            .min(1, "La descripción de la aval es obligatoria")
            .max(2000, "La descripción no puede exceder 2000 caracteres"),
        precio: z.number()
            .min(0, "El precio no puede ser negativo")
            .max(999999, "El precio no puede exceder $999,999"),
        archivo: z.string()
            .min(1, "La URL del archivo es obligatoria")
            .max(2000, "La URL no puede exceder 2000 caracteres")
            .trim(),
    }).optional(),
});

export const UpdateCourseSchema = CourseSchema.partial();

export type ValidatedCourse = z.infer<typeof CourseSchema>;
export type ValidatedUpdateCourse = z.infer<typeof UpdateCourseSchema>;
