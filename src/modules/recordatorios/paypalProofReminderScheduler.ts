import { firestore } from '../../config/firebase';
import { sendPaypalProofReminderEmail } from '../emails/paypalProofReminderEmail';

const COLLECTION = 'paypal_proof_reminders';
const AWAITING_PAYPAL_STATUS = 'awaiting_paypal_proof';

const THIRTY_MINUTES_MS = 30 * 60 * 1000;

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

const MIN_SCHEDULE_DELAY_MS = 5 * 1000;

const proofEmail = process.env.PAYPAL_PROOF_EMAIL || 'administracion@ineeoficial.com';
const LOG_TIMEZONE = process.env.TZ || 'America/Argentina/Buenos_Aires';

const formatScheduleTime = (date: Date): string =>
    date.toLocaleString('es-AR', {
        timeZone: LOG_TIMEZONE,
        dateStyle: 'short',
        timeStyle: 'medium',
    });

const describeDelay = (emailsSent: number): string => {
    if (emailsSent === 0) return '30 min desde creación del recordatorio';
    if (emailsSent === 1) return '2 h desde el email anterior';
    return '24 h desde el email anterior';
};

const logScheduledSend = (params: {
    reminderId: string;
    orderNumber?: string;
    emailNumber: number;
    runAt: Date;
    delayMs: number;
    reason: string;
}) => {
    const { reminderId, orderNumber, emailNumber, runAt, delayMs, reason } = params;
    const orderLabel = orderNumber ? `orden ${orderNumber}` : `reminder ${reminderId}`;
    console.log(
        `[PayPal Reminder] Programado email #${emailNumber} | ${orderLabel} | ` +
        `en ${Math.round(delayMs / 60000)} min | ` +
        `horario: ${formatScheduleTime(runAt)} (${LOG_TIMEZONE}) | ` +
        `ISO: ${runAt.toISOString()} | motivo: ${reason}`
    );
};

interface ReminderTimer {
    stop: () => void;
}

const scheduledJobs = new Map<string, ReminderTimer>();

interface OrderRecord {
    id: string;
    status?: string;
    items?: unknown[];
}

const findOrder = async (userId: string, orderNumber: string): Promise<OrderRecord | null> => {
    const snapshot = await firestore
        .collection('orders')
        .where('userId', '==', userId)
        .where('orderNumber', '==', orderNumber)
        .limit(1)
        .get();

    if (snapshot.empty) return null;

    const doc = snapshot.docs[0];
    const data = doc.data();
    return {
        id: doc.id,
        status: data.status as string | undefined,
        items: Array.isArray(data.items) ? data.items : [],
    };
};

const isOrderAwaitingPaypalProof = async (userId: string, orderNumber: string): Promise<boolean> => {
    const order = await findOrder(userId, orderNumber);
    return !!order && order.status === AWAITING_PAYPAL_STATUS;
};

const getDelayForNextEmail = (emailsSent: number): number => {
    if (emailsSent === 0) return THIRTY_MINUTES_MS;
    if (emailsSent === 1) return TWO_HOURS_MS;
    return TWENTY_FOUR_HOURS_MS;
};

const computeNextSendAt = (reminder: {
    createdAt: FirebaseFirestore.Timestamp | Date;
    emailsSent?: number;
    lastSentAt?: FirebaseFirestore.Timestamp | Date;
}): Date => {
    const emailsSent = reminder.emailsSent ?? 0;
    const createdAt = reminder.createdAt instanceof Date
        ? reminder.createdAt
        : reminder.createdAt.toDate();

    if (emailsSent === 0) {
        return new Date(createdAt.getTime() + THIRTY_MINUTES_MS);
    }

    const lastSentAt = reminder.lastSentAt
        ? (reminder.lastSentAt instanceof Date ? reminder.lastSentAt : reminder.lastSentAt.toDate())
        : createdAt;

    return new Date(lastSentAt.getTime() + getDelayForNextEmail(emailsSent));
};

const stopScheduledJob = (reminderId: string) => {
    const job = scheduledJobs.get(reminderId);
    if (job) {
        job.stop();
        scheduledJobs.delete(reminderId);
    }
};

const completeReminder = async (
    reminderRef: FirebaseFirestore.DocumentReference,
    reason: string
) => {
    stopScheduledJob(reminderRef.id);
    await reminderRef.update({
        status: 'completed',
        completedAt: new Date(),
        completionReason: reason,
    });
};

const executePaypalProofReminder = async (reminderId: string) => {
    const reminderRef = firestore.collection(COLLECTION).doc(reminderId);

    try {
        const reminderDoc = await reminderRef.get();
        if (!reminderDoc.exists) {
            stopScheduledJob(reminderId);
            return;
        }

        const reminder = reminderDoc.data() as {
            userId: string;
            orderNumber: string;
            email: string;
            userName?: string;
            status: string;
            emailsSent?: number;
        };

        if (reminder.status !== 'active') {
            stopScheduledJob(reminderId);
            return;
        }

        const order = await findOrder(reminder.userId, reminder.orderNumber);
        if (!order || order.status !== AWAITING_PAYPAL_STATUS) {
            await completeReminder(reminderRef, 'order_status_changed');
            return;
        }

        await sendPaypalProofReminderEmail({
            userName: reminder.userName || '',
            userEmail: reminder.email,
            orderNumber: reminder.orderNumber,
            proofEmail,
            items: order.items ?? [],
        });

        const emailsSent = (reminder.emailsSent ?? 0) + 1;
        const lastSentAt = new Date();

        await reminderRef.update({
            emailsSent,
            lastSentAt,
        });

        console.log(
            `[PayPal Reminder] Email #${emailsSent} ENVIADO | orden ${reminder.orderNumber} | ` +
            `${formatScheduleTime(lastSentAt)} (${LOG_TIMEZONE})`
        );

        stopScheduledJob(reminderId);

        const stillAwaiting = await isOrderAwaitingPaypalProof(reminder.userId, reminder.orderNumber);
        if (!stillAwaiting) {
            console.log(
                `[PayPal Reminder] Secuencia finalizada | orden ${reminder.orderNumber} | la orden ya no está en awaiting_paypal_proof`
            );
            await completeReminder(reminderRef, 'order_status_changed_after_send');
            return;
        }

        const nextSendAt = new Date(lastSentAt.getTime() + getDelayForNextEmail(emailsSent));
        await reminderRef.update({ nextSendAt });
        schedulePaypalProofReminderJob(reminderId, nextSendAt, {
            orderNumber: reminder.orderNumber,
            emailNumber: emailsSent + 1,
            emailsSent,
        });
    } catch (error) {
        console.error(`Error al ejecutar recordatorio PayPal (${reminderId}):`, error);
        await reminderRef.update({
            status: 'error',
            errorAt: new Date(),
            error: String(error),
        });
        stopScheduledJob(reminderId);
    }
};


export const schedulePaypalProofReminderJob = (
    reminderId: string,
    sendAt: Date,
    context?: { orderNumber?: string; emailNumber?: number; emailsSent?: number }
) => {
    stopScheduledJob(reminderId);

    const now = Date.now();
    const delayMs = Math.max(sendAt.getTime() - now, MIN_SCHEDULE_DELAY_MS);
    const runAt = new Date(now + delayMs);
    const emailNumber = context?.emailNumber ?? (context?.emailsSent ?? 0) + 1;
    const delayLabel = describeDelay(context?.emailsSent ?? 0);

    const timeoutId = setTimeout(() => {
        scheduledJobs.delete(reminderId);
        executePaypalProofReminder(reminderId);
    }, delayMs);

    const timer: ReminderTimer = {
        stop: () => clearTimeout(timeoutId),
    };

    scheduledJobs.set(reminderId, timer);

    logScheduledSend({
        reminderId,
        orderNumber: context?.orderNumber,
        emailNumber,
        runAt,
        delayMs,
        reason: delayLabel,
    });
};

export const cancelActivePaypalProofReminders = async (
    userId: string,
    orderNumber: string,
    reason = 'proof_submitted'
): Promise<void> => {
    const snapshot = await firestore
        .collection(COLLECTION)
        .where('userId', '==', userId)
        .where('orderNumber', '==', orderNumber)
        .where('status', '==', 'active')
        .get();

    await Promise.all(
        snapshot.docs.map(async (doc) => {
            stopScheduledJob(doc.id);
            await doc.ref.update({
                status: 'completed',
                completedAt: new Date(),
                completionReason: reason,
            });
        })
    );
};

export const restoreActivePaypalProofReminders = async () => {
    if (!process.env.RESEND_API_KEY) {
        console.warn('RESEND_API_KEY no configurada: no se restauran recordatorios PayPal');
        return;
    }

    const snapshot = await firestore
        .collection(COLLECTION)
        .where('status', '==', 'active')
        .get();

    for (const doc of snapshot.docs) {
        const reminder = doc.data() as {
            userId: string;
            orderNumber: string;
            createdAt: FirebaseFirestore.Timestamp | Date;
            emailsSent?: number;
            lastSentAt?: FirebaseFirestore.Timestamp | Date;
        };
        const stillAwaiting = await isOrderAwaitingPaypalProof(
            reminder.userId,
            reminder.orderNumber
        );

        if (!stillAwaiting) {
            await doc.ref.update({
                status: 'completed',
                completedAt: new Date(),
                completionReason: 'order_status_changed_on_restore',
            });
            continue;
        }

        const emailsSent = reminder.emailsSent ?? 0;
        const nextSendAt = computeNextSendAt(reminder);
        await doc.ref.update({ nextSendAt });
        schedulePaypalProofReminderJob(doc.id, nextSendAt, {
            orderNumber: reminder.orderNumber,
            emailNumber: emailsSent + 1,
            emailsSent,
        });
    }

    console.log(
        `[PayPal Reminder] Restauración al iniciar servidor: ${snapshot.size} recordatorio(s) activo(s)`
    );
};
