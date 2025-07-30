// /src/modules/purchases/types.ts
export interface Purchase {
  id?: string;
  userId: string;
  courseId: string;
  createdAt: Date;
  paymentStatus: 'approved' | 'pending' | 'cancelled';

  //TODO: TODAS estas propiedades son solo ejemplos, eliminar o reemplazar por las reales
}
