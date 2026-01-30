export interface UserRegistrationData {
  email: string;
  password: string;
  nombre: string;
  apellido: string;
  dni: string;
  aceptaTerminos: boolean;
}

import { ResumenProgreso } from './progress';

export interface UserProfile {
  uid: string;
  email: string;
  nombre: string;
  apellido: string;
  dni: string;
  role: string;
  fechaRegistro: Date;
  fechaActualizacion: Date;
  aceptaTerminos: boolean;
  activo: boolean;
  provider?: string; 
  fechaEliminacion?: Date;
  // MEMBRESÍAS DESACTIVADAS - Comentado para posible reactivación futura
  // membresia_id?: string;
  cursos_asignados?: string[];
  eventos_asignados?: string[];
  ebooks_asignados?: string[];
  resumen_progreso?: ResumenProgreso;
}

export interface LoginData {
  email: string;
  password: string;
}

export interface UpdateProfileData {
  nombre?: string;
  apellido?: string;
}

type ResourceType = 'curso' | 'evento' | 'ebook';

export interface SendAssignmentEmailParams {
  userEmail: string;
  userName: string;
  userLastName: string;
  resourceType: ResourceType;
  resourceTitles: string[];
}
