import { Request, Response } from 'express';
import mercadopago from './client';
import { firestore } from '../../config/firebase';

// ✅ Crear preferencia
export const createPreference = async (req: Request, res: Response) => {
  try {
    const { courseId, title, price, userId } = req.body;

    // Validar campos requeridos
    if (!courseId || !title || !price || !userId) {
      return res.status(400).json({ error: 'Faltan campos requeridos: courseId, title, price, userId' });
    }

    const preference = {
      items: [
        {
          title,
          unit_price: Number(price),
          quantity: 1,
        },
      ],
      back_urls: {
        success: 'https://tusitio.com/pago-exitoso',
        failure: 'https://tusitio.com/pago-fallido',
        pending: 'https://tusitio.com/pago-pendiente',
      },
      notification_url: `${process.env.BASE_URL}/api/mercado-pago/webhook`,
      metadata: { userId, courseId },
      auto_return: 'approved', // Opcional: redirige automáticamente si el pago es aprobado
    };

    //const response = await mercadopago.preferences.create(preference);
    var response: any;

    // Devuelve el enlace para redirigir al usuario
    return res.json({ init_point: response.body.init_point });
  } catch (err: any) {
    console.error('createPreference error:', err);
    
    // Mejor manejo del error de Mercado Pago
    const errorMessage = err.body?.message || 'Error al generar pago';
    return res.status(500).json({ error: 'Error al generar pago', details: errorMessage });
  }
};

// 📬 Webhook de notificación
export const handleWebhook = async (req: Request, res: Response) => {
  try {
    const { type, data } = req.body;

    // Solo procesamos notificaciones de tipo "payment"
    if (type !== 'payment') {
      return res.sendStatus(200); // Aceptar otras notificaciones sin acción
    }

    // Obtener detalles del pago
    //const payment = await mercadopago.payment.findById(data.id);
    var payment: any;
    const { metadata, status } = payment.body;

    // Validar que metadata exista
    if (!metadata || !metadata.userId || !metadata.courseId) {
      console.warn('Metadata faltante en el pago:', data.id);
      return res.sendStatus(400);
    }

    if (status === 'approved') {
      const purchaseRef = firestore.collection('purchases');
      const snapshot = await purchaseRef
        .where('userId', '==', metadata.userId)
        .where('courseId', '==', metadata.courseId)
        .get();

      if (snapshot.empty) {
        await purchaseRef.add({
          userId: metadata.userId,
          courseId: metadata.courseId,
          createdAt: new Date(),
          paymentStatus: 'approved',
        });
        

        console.log(`Compra registrada para userId: ${metadata.userId}, courseId: ${metadata.courseId}`);
      } else {
        console.log('La compra ya existe, omitiendo duplicado.');
      }

      const userDoc = await firestore.collection('users').doc(metadata.userId).get();
      await userDoc.ref.update({ cursos_asignados: [...userDoc.data()?.cursos_asignados || [], metadata.courseId] });
    }

    // Confirmar recepción
    return res.sendStatus(200);
  } catch (err: any) {
    console.error('handleWebhook error:', err);
    return res.sendStatus(500);
  }
};