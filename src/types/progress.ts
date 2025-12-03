import { z } from 'zod';

// Esquema para marcar contenido como completado
export const MarcarCompletadoSchema = z.object({
  userId: z.string().min(1, "El ID del usuario es requerido"),
  cursoId: z.string().min(1, "El ID del curso es requerido"),
  moduloId: z.string().min(1, "El ID del módulo es requerido"),
  contenidoId: z.string().min(1, "El ID del contenido es requerido"),
});

// Esquema para desmarcar contenido
export const DesmarcarCompletadoSchema = z.object({
  userId: z.string().min(1, "El ID del usuario es requerido"),
  cursoId: z.string().min(1, "El ID del curso es requerido"),
  moduloId: z.string().min(1, "El ID del módulo es requerido"),
  contenidoId: z.string().min(1, "El ID del contenido es requerido"),
});

// Tipos
export type MarcarCompletadoData = z.infer<typeof MarcarCompletadoSchema>;
export type DesmarcarCompletadoData = z.infer<typeof DesmarcarCompletadoSchema>;

// Interfaces para la estructura de datos
export interface ProgresoModulo {
  modulo_id: string;
  curso_id: string;
  contenidos_completados: string[];
  completado: boolean;
  fecha_actualizacion: Date;
}

export interface ResumenProgresoCurso {
  progreso: number; // 0-100
  contenidos_completados: number;
  total_contenidos: number;
  ultima_actividad: Date;
}

export interface ResumenProgreso {
  [cursoId: string]: ResumenProgresoCurso;
}

export interface ProgresoModuloDetalle {
  modulo_id: string;
  nombre: string;
  progreso: number;
  contenidos_totales: number;
  contenidos_completados: number;
  completado: boolean;
}

export interface ProgresoCursoResponse {
  progreso_general: number;
  total_contenidos: number;
  contenidos_completados: number;
  modulos: ProgresoModuloDetalle[];
}

export interface EstadoContenidoResponse {
  completado: boolean;
  fecha_completado: Date | null;
}

export interface CursoConProgreso {
  id: string;
  titulo: string;
  descripcion: string;
  imagen: string;
  progreso: number;
  contenidos_completados: number;
  total_contenidos: number;
  ultima_actividad: Date | null;
}

