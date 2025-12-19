import { Request, Response } from 'express';
import { firestore } from '../../config/firebase';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import {
  InscribirseEventoData,
  InscripcionEvento,
  DisponibilidadInscripcion,
  RespuestaInscripcion,
} from '../../types/event-registrations';

const collection = firestore.collection('inscripciones_eventos');

/**
 * Verificar disponibilidad de inscripción a un evento
 * GET /api/inscripciones-eventos/disponibilidad/:eventoId
 */
export const verificarDisponibilidad = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user.uid;
    const { eventoId } = req.params;

    // Obtener datos del evento
    const eventoDoc = await firestore.collection('events').doc(eventoId).get();
    if (!eventoDoc.exists) {
      return res.status(404).json({ error: 'Evento no encontrado' });
    }

    const eventoData = eventoDoc.data();
    const precio = eventoData?.precio || 0;
    const membresiaIdEvento = eventoData?.membresiaId || null;
    const esGratuito = precio === 0;

    // Obtener datos del usuario
    const userDoc = await firestore.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const userData = userDoc.data();
    // Soporta múltiples formatos:
    // 1. membresia_id (string)
    // 2. membresia (objeto con id: {id: "..."})
    // 3. membresia (string directo: "PX0nxpuXgLEgUNKNhIFl")
    const membresiaIdUsuario = 
      (typeof userData?.membresia === 'object' && userData?.membresia?.id) 
        ? userData.membresia.id 
        : (typeof userData?.membresia === 'string' 
          ? userData.membresia 
          : userData?.membresia_id) || null;
    
    // Debug: Log para verificar la lectura de membresía
    console.log('[verificarDisponibilidad] Membresía del usuario:', {
      membresiaIdUsuario,
      membresia_id: userData?.membresia_id,
      membresia: userData?.membresia,
      membresiaType: typeof userData?.membresia,
      membresiaIdEvento,
    });

    // Verificar si ya está inscrito
    const inscripcionExistente = await collection
      .where('userId', '==', userId)
      .where('eventoId', '==', eventoId)
      .where('estado', '==', 'activa')
      .limit(1)
      .get();

    const yaInscrito = !inscripcionExistente.empty;
    const inscripcionId = yaInscrito ? inscripcionExistente.docs[0].id : null;

    // Verificar si tiene la membresía requerida
    const tieneMembresia = membresiaIdEvento && membresiaIdUsuario === membresiaIdEvento;

    // Determinar disponibilidad y acción requerida
    let puedeInscribirse = false;
    let requierePago = false;
    let accionRequerida: 'inscribir' | 'comprar' | 'no_disponible' | 'ya_inscrito' = 'no_disponible';
    let mensaje = '';

    if (yaInscrito) {
      mensaje = '✅ Ya estás inscrito a este evento. No puedes inscribirte nuevamente.';
      accionRequerida = 'ya_inscrito';
    } else if (esGratuito && tieneMembresia) {
      // Evento gratuito y tiene membresía → puede inscribirse gratis
      puedeInscribirse = true;
      requierePago = false;
      accionRequerida = 'inscribir';
      mensaje = 'Puedes inscribirte gratis con tu membresía';
    } else if (esGratuito && !tieneMembresia && membresiaIdEvento) {
      // Evento gratuito pero requiere membresía específica
      puedeInscribirse = false;
      requierePago = false;
      accionRequerida = 'no_disponible';
      mensaje = 'Este evento requiere una membresía específica';
    } else if (esGratuito && !membresiaIdEvento) {
      // Evento completamente gratuito sin requisitos
      puedeInscribirse = true;
      requierePago = false;
      accionRequerida = 'inscribir';
      mensaje = 'Puedes inscribirte gratis';
    } else if (!esGratuito && tieneMembresia) {
      // Evento de pago pero tiene membresía → puede inscribirse gratis
      puedeInscribirse = true;
      requierePago = false;
      accionRequerida = 'inscribir';
      mensaje = 'Puedes inscribirte gratis con tu membresía';
    } else {
      // Evento de pago sin membresía → debe comprar
      puedeInscribirse = false;
      requierePago = true;
      accionRequerida = 'comprar';
      mensaje = `Debes comprar el evento por $${precio}`;
    }

    const respuesta: DisponibilidadInscripcion = {
      puedeInscribirse,
      esGratuito,
      tieneMembresia: tieneMembresia || false,
      requierePago,
      precio,
      mensaje,
      accionRequerida,
      yaInscrito,
      inscripcionId: inscripcionId || undefined,
    };

    return res.status(200).json({
      success: true,
      data: respuesta,
    });
  } catch (error) {
    console.error('Error al verificar disponibilidad:', error);
    return res.status(500).json({
      error: 'Error interno del servidor al verificar disponibilidad',
    });
  }
};

/**
 * Inscribirse a un evento
 * POST /api/inscripciones-eventos/inscribirse
 * Lógica:
 * - Si tiene membresía Y es gratuito → inscribir gratis
 * - Si no tiene membresía → debe comprar (y la inscripción se realiza automáticamente al comprar)
 */
export const inscribirseEvento = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user.uid;
    const { eventoId }: InscribirseEventoData = req.body;

    // Validar que el evento existe
    const eventoDoc = await firestore.collection('events').doc(eventoId).get();
    if (!eventoDoc.exists) {
      return res.status(404).json({ error: 'Evento no encontrado' });
    }

    const eventoData = eventoDoc.data();
    const precio = eventoData?.precio || 0;
    const membresiaIdEvento = eventoData?.membresiaId || null;
    const esGratuito = precio === 0;

    // Obtener datos del usuario
    const userDoc = await firestore.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const userData = userDoc.data();
    // Soporta múltiples formatos:
    // 1. membresia_id (string)
    // 2. membresia (objeto con id: {id: "..."})
    // 3. membresia (string directo: "PX0nxpuXgLEgUNKNhIFl")
    const membresiaIdUsuario = 
      (typeof userData?.membresia === 'object' && userData?.membresia?.id) 
        ? userData.membresia.id 
        : (typeof userData?.membresia === 'string' 
          ? userData.membresia 
          : userData?.membresia_id) || null;
    
    // Debug: Log para verificar la lectura de membresía
    console.log('[inscribirseEvento] Membresía del usuario:', {
      membresiaIdUsuario,
      membresia_id: userData?.membresia_id,
      membresia: userData?.membresia,
      membresiaType: typeof userData?.membresia,
      membresiaIdEvento,
    });

    // Verificar si ya está inscrito
    const inscripcionExistente = await collection
      .where('userId', '==', userId)
      .where('eventoId', '==', eventoId)
      .where('estado', '==', 'activa')
      .limit(1)
      .get();

    if (!inscripcionExistente.empty) {
      const inscripcionData = inscripcionExistente.docs[0].data();
      return res.status(400).json({
        success: false,
        error: 'Ya estás inscrito a este evento',
        mensaje: '✅ Ya estás inscrito a este evento. No puedes inscribirte nuevamente.',
        inscripcionId: inscripcionExistente.docs[0].id,
        alerta: {
          mensaje: '⚠️ Ya estás inscrito a este evento. No puedes inscribirte nuevamente.',
          tipo: 'warning',
          mostrar: true,
        },
        fechaInscripcion: inscripcionData.fechaInscripcion?.toDate?.() 
          ? inscripcionData.fechaInscripcion.toDate().toISOString()
          : inscripcionData.fechaInscripcion,
      });
    }

    // Verificar si tiene la membresía requerida
    const tieneMembresia = membresiaIdEvento && membresiaIdUsuario === membresiaIdEvento;

    // Determinar si puede inscribirse gratis o requiere pago
    let puedeInscribirseGratis = false;
    let metodoPago: 'gratis' | 'pago' | 'membresia' = 'pago';

    if (esGratuito && (!membresiaIdEvento || tieneMembresia)) {
      // Evento gratuito sin requisitos o con membresía que tiene
      puedeInscribirseGratis = true;
      metodoPago = tieneMembresia ? 'membresia' : 'gratis';
    } else if (!esGratuito && tieneMembresia) {
      // Evento de pago pero tiene membresía
      puedeInscribirseGratis = true;
      metodoPago = 'membresia';
    } else if (esGratuito && membresiaIdEvento && !tieneMembresia) {
      // Evento gratuito pero requiere membresía específica
      return res.status(403).json({
        error: 'Este evento requiere una membresía específica',
        requiereMembresia: true,
        membresiaId: membresiaIdEvento,
      });
    }

    // Si requiere pago, retornar información para crear preferencia de pago
    // NOTA: Cuando el pago se apruebe (webhook), la inscripción se creará automáticamente
    if (!puedeInscribirseGratis) {
      return res.status(200).json({
        success: false,
        message: 'Este evento requiere pago. Al completar la compra, tu inscripción se realizará automáticamente.',
        alerta: {
          mensaje: '⚠️ Este evento requiere pago. Al completar la compra, tu inscripción se realizará automáticamente.',
          tipo: 'info',
          mostrar: true,
        },
        requierePago: true,
        precio,
        accion: 'comprar',
        eventoId,
      } as RespuestaInscripcion);
    }

    // Inscribir al usuario (gratis o con membresía)
    const nuevaInscripcion: InscripcionEvento = {
      userId,
      eventoId,
      fechaInscripcion: new Date(),
      estado: 'activa',
      metodoPago,
      precioPagado: 0,
    };

    const inscripcionRef = await collection.add(nuevaInscripcion);
    const inscripcionId = inscripcionRef.id;

    // Mensaje de alerta para el usuario
    let mensajeAlerta = '';
    let tipoAlerta: 'success' | 'info' = 'success';
    
    if (metodoPago === 'membresia') {
      mensajeAlerta = '✅ ¡Inscripción exitosa! Te has inscrito al evento usando tu membresía.';
    } else {
      mensajeAlerta = '✅ ¡Inscripción exitosa! Te has inscrito al evento gratuito.';
    }

    return res.status(201).json({
      success: true,
      message: mensajeAlerta,
      alerta: {
        mensaje: mensajeAlerta,
        tipo: tipoAlerta,
        mostrar: true, // Flag para indicar al frontend que debe mostrar la alerta
      },
      inscripcionId,
      requierePago: false,
      metodoPago,
    } as RespuestaInscripcion);
  } catch (error) {
    console.error('Error al inscribirse al evento:', error);
    return res.status(500).json({
      error: 'Error interno del servidor al inscribirse al evento',
    });
  }
};

/**
 * Webhook para procesar pago de evento y crear inscripción automáticamente
 * POST /api/inscripciones-eventos/webhook-pago
 * Este endpoint se llama automáticamente cuando Mercado Pago confirma un pago
 * La inscripción se realiza automáticamente al comprar
 */
export const webhookPagoEvento = async (req: Request, res: Response) => {
  try {
    // Este endpoint recibiría el webhook de Mercado Pago
    // Por ahora, acepta datos manuales para testing
    const { eventoId, userId, paymentId, paymentStatus, precio } = req.body;

    if (!eventoId || !userId || !paymentId) {
      return res.status(400).json({ error: 'Datos incompletos' });
    }

    // Verificar que el pago fue aprobado
    if (paymentStatus !== 'approved') {
      return res.status(400).json({
        error: 'El pago no fue aprobado',
        paymentStatus,
      });
    }

    // Verificar si ya está inscrito
    const inscripcionExistente = await collection
      .where('userId', '==', userId)
      .where('eventoId', '==', eventoId)
      .where('estado', '==', 'activa')
      .limit(1)
      .get();

    if (!inscripcionExistente.empty) {
      return res.status(200).json({
        success: true,
        message: 'Ya estaba inscrito a este evento',
        inscripcionId: inscripcionExistente.docs[0].id,
      });
    }

    // Crear inscripción automáticamente después del pago aprobado
    const nuevaInscripcion: InscripcionEvento = {
      userId,
      eventoId,
      fechaInscripcion: new Date(),
      estado: 'activa',
      metodoPago: 'pago',
      precioPagado: precio || 0,
      paymentId,
      paymentStatus: 'approved',
    };

    const inscripcionRef = await collection.add(nuevaInscripcion);
    const inscripcionId = inscripcionRef.id;

    console.log(`✅ Inscripción automática creada para evento ${eventoId} después de pago aprobado`);

    return res.status(201).json({
      success: true,
      message: 'Inscripción creada automáticamente después del pago',
      alerta: {
        mensaje: '✅ ¡Inscripción exitosa! Te has inscrito al evento después de completar tu compra.',
        tipo: 'success',
        mostrar: true,
      },
      inscripcionId,
    });
  } catch (error) {
    console.error('Error en webhook de pago de evento:', error);
    return res.status(500).json({
      error: 'Error interno del servidor al procesar webhook de pago',
    });
  }
};

/**
 * Comprar e inscribirse a un evento (después del pago)
 * POST /api/inscripciones-eventos/comprar-e-inscribirse
 * Este endpoint puede ser llamado manualmente después de confirmar el pago
 */
export const comprarEInscribirse = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user.uid;
    const { eventoId, paymentId, paymentStatus } = req.body;

    // Validar que el evento existe
    const eventoDoc = await firestore.collection('events').doc(eventoId).get();
    if (!eventoDoc.exists) {
      return res.status(404).json({ error: 'Evento no encontrado' });
    }

    const eventoData = eventoDoc.data();
    const precio = eventoData?.precio || 0;

    // Verificar que el pago fue aprobado
    if (paymentStatus !== 'approved') {
      return res.status(400).json({
        error: 'El pago no fue aprobado',
        paymentStatus,
      });
    }

    // Verificar si ya está inscrito
    const inscripcionExistente = await collection
      .where('userId', '==', userId)
      .where('eventoId', '==', eventoId)
      .where('estado', '==', 'activa')
      .limit(1)
      .get();

    if (!inscripcionExistente.empty) {
      return res.status(400).json({
        error: 'Ya estás inscrito a este evento',
        inscripcionId: inscripcionExistente.docs[0].id,
      });
    }

    // Crear inscripción con pago
    const nuevaInscripcion: InscripcionEvento = {
      userId,
      eventoId,
      fechaInscripcion: new Date(),
      estado: 'activa',
      metodoPago: 'pago',
      precioPagado: precio,
      paymentId,
      paymentStatus: paymentStatus as 'approved' | 'pending' | 'cancelled',
    };

    const inscripcionRef = await collection.add(nuevaInscripcion);
    const inscripcionId = inscripcionRef.id;

    // Mensaje de alerta para el usuario después de comprar
    const mensajeAlerta = '✅ ¡Inscripción exitosa! Te has inscrito al evento después de completar tu compra.';

    return res.status(201).json({
      success: true,
      message: mensajeAlerta,
      alerta: {
        mensaje: mensajeAlerta,
        tipo: 'success',
        mostrar: true,
      },
      inscripcionId,
      requierePago: false,
    } as RespuestaInscripcion);
  } catch (error) {
    console.error('Error al comprar e inscribirse:', error);
    return res.status(500).json({
      error: 'Error interno del servidor al comprar e inscribirse',
    });
  }
};

/**
 * Listar inscripciones del usuario
 * GET /api/inscripciones-eventos/mis-inscripciones
 */
export const listarMisInscripciones = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user.uid;

    // Obtener todas las inscripciones activas del usuario
    // Nota: Firestore requiere índice compuesto para where + orderBy
    // Por ahora, obtenemos todas y ordenamos en memoria
    const snapshot = await collection
      .where('userId', '==', userId)
      .where('estado', '==', 'activa')
      .get();

    let inscripciones = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Ordenar por fecha de inscripción (descendente) en memoria
    inscripciones.sort((a: any, b: any) => {
      const fechaA = a.fechaInscripcion?.toDate?.() || a.fechaInscripcion || new Date(0);
      const fechaB = b.fechaInscripcion?.toDate?.() || b.fechaInscripcion || new Date(0);
      return fechaB.getTime() - fechaA.getTime();
    });

    // Obtener información de los eventos
    const eventosPromises = inscripciones.map((inscripcion: any) =>
      firestore.collection('events').doc(inscripcion.eventoId).get()
    );
    const eventosDocs = await Promise.all(eventosPromises);

    const inscripcionesConEvento = inscripciones.map((inscripcion: any, index: number) => {
      const eventoDoc = eventosDocs[index];
      return {
        ...inscripcion,
        evento: eventoDoc.exists ? {
          id: eventoDoc.id,
          ...eventoDoc.data(),
        } : null,
      };
    });

    return res.status(200).json({
      success: true,
      data: inscripcionesConEvento,
    });
  } catch (error) {
    console.error('Error al listar inscripciones:', error);
    return res.status(500).json({
      error: 'Error interno del servidor al listar inscripciones',
    });
  }
};

/**
 * Verificar si el usuario está inscrito a un evento
 * GET /api/inscripciones-eventos/verificar/:eventoId
 */
export const verificarInscripcion = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user.uid;
    const { eventoId } = req.params;

    const snapshot = await collection
      .where('userId', '==', userId)
      .where('eventoId', '==', eventoId)
      .where('estado', '==', 'activa')
      .limit(1)
      .get();

    const estaInscrito = !snapshot.empty;
    const inscripcionData = estaInscrito ? snapshot.docs[0].data() : null;
    const inscripcion: (InscripcionEvento & { id: string }) | null = estaInscrito ? {
      id: snapshot.docs[0].id,
      ...inscripcionData,
    } as InscripcionEvento & { id: string } : null;

    // Si está inscrito, incluir información adicional
    if (estaInscrito && inscripcion && inscripcionData) {
      // Manejar fechaInscripcion que puede ser Date o Firestore Timestamp
      const fechaInscripcion = (inscripcionData.fechaInscripcion as any)?.toDate?.() 
        ? (inscripcionData.fechaInscripcion as any).toDate().toISOString()
        : inscripcionData.fechaInscripcion;
      
      return res.status(200).json({
        success: true,
        data: {
          estaInscrito: true,
          inscripcion: {
            ...inscripcion,
            fechaInscripcion,
          },
          mensaje: '✅ Ya estás inscrito a este evento',
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        estaInscrito: false,
        inscripcion: null,
        mensaje: 'No estás inscrito a este evento',
      },
    });
  } catch (error) {
    console.error('Error al verificar inscripción:', error);
    return res.status(500).json({
      error: 'Error interno del servidor al verificar inscripción',
    });
  }
};

/**
 * Cancelar inscripción
 * DELETE /api/inscripciones-eventos/:inscripcionId
 */
export const cancelarInscripcion = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user.uid;
    const { inscripcionId } = req.params;

    const inscripcionDoc = await collection.doc(inscripcionId).get();
    if (!inscripcionDoc.exists) {
      return res.status(404).json({ error: 'Inscripción no encontrada' });
    }

    const inscripcionData = inscripcionDoc.data() as InscripcionEvento;
    if (inscripcionData.userId !== userId) {
      return res.status(403).json({ error: 'No tienes permiso para cancelar esta inscripción' });
    }

    if (inscripcionData.estado === 'cancelada') {
      return res.status(400).json({ error: 'La inscripción ya está cancelada' });
    }

    await collection.doc(inscripcionId).update({
      estado: 'cancelada',
    });

    return res.status(200).json({
      success: true,
      message: 'Inscripción cancelada exitosamente',
    });
  } catch (error) {
    console.error('Error al cancelar inscripción:', error);
    return res.status(500).json({
      error: 'Error interno del servidor al cancelar inscripción',
    });
  }
};
