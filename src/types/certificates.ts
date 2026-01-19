import { z } from 'zod';

// Esquema para generar certificado
export const GenerarCertificadoSchema = z.object({
  cursoId: z.string().min(1, "El ID del curso es requerido"),
});

// Tipos
export type GenerarCertificadoData = z.infer<typeof GenerarCertificadoSchema>;

// Interfaces
export interface CertificadoData {
  certificadoId: string;
  usuarioId: string;
  cursoId: string;
  nombreCompleto: string;
  dni: string;
  nombreCurso: string;
  fechaFinalizacion: Date;
  fechaEmision: Date;
  qrCodeUrl: string;
  validationUrl: string;
}

export interface CertificadoValidationResponse {
  valido: boolean;
  certificado?: CertificadoData;
  mensaje: string;
}



