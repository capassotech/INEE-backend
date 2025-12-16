import { z } from 'zod';

// Esquema para inscribirse a un evento
export const InscribirseEventoSchema = z.object({
  eventoId: z.string().min(1, "El ID del evento es requerido"),
});

// Tipos
export type InscribirseEventoData = z.infer<typeof InscribirseEventoSchema>;

// Interface para inscripción a evento
export interface InscripcionEvento {
  id?: string;
  userId: string;
  eventoId: string;
  fechaInscripcion: Date;
  estado: 'activa' | 'cancelada';
  metodoPago: 'gratis' | 'pago' | 'membresia';
  precioPagado?: number;
  paymentId?: string; // ID de pago de Mercado Pago si aplica
  paymentStatus?: 'approved' | 'pending' | 'cancelled';
}

// Respuesta al verificar disponibilidad de inscripción
export interface DisponibilidadInscripcion {
  puedeInscribirse: boolean;
  esGratuito: boolean;
  tieneMembresia: boolean;
  requierePago: boolean;
  precio: number;
  mensaje: string;
  accionRequerida: 'inscribir' | 'comprar' | 'no_disponible' | 'ya_inscrito';
  yaInscrito?: boolean;
  inscripcionId?: string;
}

// Alerta para mostrar al usuario
export interface AlertaInscripcion {
  mensaje: string;
  tipo: 'success' | 'info' | 'warning' | 'error';
  mostrar: boolean;
}

// Respuesta al inscribirse
export interface RespuestaInscripcion {
  success: boolean;
  message: string;
  alerta?: AlertaInscripcion;
  inscripcionId?: string;
  requierePago?: boolean;
  precio?: number;
  eventoId?: string;
  metodoPago?: 'gratis' | 'pago' | 'membresia';
  preferenciaPago?: {
    id: string;
    init_point: string;
  };
}
