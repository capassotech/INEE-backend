import { Request, Response } from 'express';
import { firestore } from '../../config/firebase';
import { CreatePaypalProofReminderSchema } from '../../types/reminders';
import {
    schedulePaypalProofReminderJob,
    restoreActivePaypalProofReminders,
} from './paypalProofReminderScheduler';

const COLLECTION = 'paypal_proof_reminders';
const AWAITING_PAYPAL_STATUS = 'awaiting_paypal_proof';
const FIRST_REMINDER_DELAY_MS = 30 * 60 * 1000;

export const createReminder = async (req: Request, res: Response) => {
    try {
        if (!process.env.RESEND_API_KEY) {
            return res.status(500).json({ error: 'Configuración de email inválida' });
        }

        const validationResult = CreatePaypalProofReminderSchema.safeParse(req.body);

        if (!validationResult.success) {
            const details = validationResult.error.issues.map((err) => ({
                field: err.path.join('.'),
                message: err.message,
            }));

            return res.status(400).json({
                error: 'Datos de validación inválidos',
                details,
            });
        }

        const { userId, orderNumber } = validationResult.data;

        const userDoc = await firestore.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        const userData = userDoc.data() as { email?: string; nombre?: string };
        const email = userData?.email;
        if (!email) {
            return res.status(400).json({ error: 'El usuario no tiene email' });
        }

        const ordersSnapshot = await firestore
            .collection('orders')
            .where('userId', '==', userId)
            .where('orderNumber', '==', orderNumber)
            .limit(1)
            .get();

        if (ordersSnapshot.empty) {
            return res.status(404).json({ error: 'Orden no encontrada' });
        }

        const orderDoc = ordersSnapshot.docs[0];
        const orderData = orderDoc.data();

        if (orderData.status !== AWAITING_PAYPAL_STATUS) {
            return res.status(400).json({
                error: 'La orden no está pendiente de comprobante PayPal',
                currentStatus: orderData.status,
            });
        }

        const existingReminders = await firestore
            .collection(COLLECTION)
            .where('userId', '==', userId)
            .where('orderNumber', '==', orderNumber)
            .where('status', '==', 'active')
            .get();

        if (!existingReminders.empty) {
            return res.status(400).json({
                error: 'Ya existe un recordatorio activo para esta orden',
                reminderId: existingReminders.docs[0].id,
            });
        }

        const sendAt = new Date(Date.now() + FIRST_REMINDER_DELAY_MS);

        const reminderRef = await firestore.collection(COLLECTION).add({
            userId,
            orderNumber,
            orderId: orderDoc.id,
            email,
            userName: userData?.nombre || '',
            status: 'active',
            emailsSent: 0,
            createdAt: new Date(),
            nextSendAt: sendAt,
        });

        schedulePaypalProofReminderJob(reminderRef.id, sendAt);

        return res.status(201).json({
            message: 'Recordatorio de comprobante PayPal programado',
            reminderId: reminderRef.id,
            orderNumber,
            firstEmailAt: sendAt,
            schedule: {
                firstEmail: '30 minutos después de la redirección a PayPal',
                secondEmail: '2 horas después del primer email',
                followingEmails: 'cada 24 horas hasta que la orden cambie de estado',
            },
        });
    } catch (error) {
        console.error('createReminder error:', error);
        return res.status(500).json({ error: 'Error al crear el recordatorio' });
    }
};

export { restoreActivePaypalProofReminders };
