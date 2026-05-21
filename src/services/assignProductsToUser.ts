import { firestore } from '../config/firebase';

export interface AssignProductsResult {
  courses: number;
  events: number;
  ebooks: number;
  skipped: number;
}

export const assignProductsToUser = async (
  userId: string,
  items: any[],
  paymentId?: string,
  paymentStatus?: string,
  metodoPagoInscripcion = 'pago'
): Promise<AssignProductsResult> => {
  const result: AssignProductsResult = {
    courses: 0,
    events: 0,
    ebooks: 0,
    skipped: 0,
  };

  const userRef = firestore.collection('users').doc(userId);
  const userDoc = await userRef.get();

  if (!userDoc.exists) {
    throw new Error(`Usuario ${userId} no encontrado`);
  }

  const userData = userDoc.data();
  const cursosAsignados = Array.isArray(userData?.cursos_asignados)
    ? [...userData.cursos_asignados]
    : [];
  const eventosAsignados = Array.isArray(userData?.eventos_asignados)
    ? [...userData.eventos_asignados]
    : [];
  const ebooksAsignados = Array.isArray(userData?.ebooks_asignados)
    ? [...userData.ebooks_asignados]
    : [];
  const inscripcionesCollection = firestore.collection('inscripciones_eventos');

  for (const item of items) {
    const productId = item.id || item.productId;
    const precio = Number(item.precio || item.price || item.unit_price || 0);

    if (!productId) {
      result.skipped += 1;
      continue;
    }

    const courseDoc = await firestore.collection('courses').doc(productId).get();
    if (courseDoc.exists) {
      if (!cursosAsignados.includes(productId)) {
        cursosAsignados.push(productId);
        result.courses += 1;
      }
      continue;
    }

    const eventDoc = await firestore.collection('events').doc(productId).get();
    if (eventDoc.exists) {
      if (!eventosAsignados.includes(productId)) {
        eventosAsignados.push(productId);
        result.events += 1;
      }

      const nuevaInscripcion: Record<string, unknown> = {
        userId,
        eventoId: productId,
        fechaInscripcion: new Date(),
        estado: 'activa',
        metodoPago: metodoPagoInscripcion,
        precioPagado: precio || 0,
      };

      if (paymentId) nuevaInscripcion.paymentId = paymentId;
      if (paymentStatus) nuevaInscripcion.paymentStatus = paymentStatus;

      await inscripcionesCollection.add(nuevaInscripcion);
      continue;
    }

    const ebookDoc = await firestore.collection('ebooks').doc(productId).get();
    if (ebookDoc.exists) {
      if (!ebooksAsignados.includes(productId)) {
        ebooksAsignados.push(productId);
        result.ebooks += 1;
      }
      continue;
    }

    const avalDoc = await firestore.collection('avales').doc(productId).get();
    if (avalDoc.exists) {
      continue;
    }

    result.skipped += 1;
  }

  await userRef.update({
    cursos_asignados: cursosAsignados,
    eventos_asignados: eventosAsignados,
    ebooks_asignados: ebooksAsignados,
    updatedAt: new Date(),
  });

  return result;
};
