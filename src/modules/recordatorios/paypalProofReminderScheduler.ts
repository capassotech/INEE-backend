import cron, { ScheduledTask } from 'node-cron';
import { firestore } from '../../config/firebase';
import { sendPaypalProofReminderEmail } from '../emails/paypalProofReminderEmail';

const COLLECTION = 'paypal_proof_reminders';
const AWAITING_PAYPAL_STATUS = 'awaiting_paypal_proof';

const THIRTY_MINUTES_MS = 30 * 60 * 1000;
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

const scheduledJobs = new Map<string, ScheduledTask>();

const timezone = process.env.TZ || 'America/Argentina/Buenos_Aires';

const isProduction = process.env.NODE_ENV === 'production';
const storeUrl = isProduction ? 'https://ineeoficial.com' : 'https://tienda-qa.ineeoficial.com';
const proofEmail = process.env.PAYPAL_PROOF_EMAIL || 'administracion@ineeoficial.com';

const toCronExpression = (date: Date): string => {
    const minute = date.getMinutes();
    const hour = date.getHours();
    const dayOfMonth = date.getDate();
    const month = date.getMonth() + 1;
    return `${minute} ${hour} ${dayOfMonth} ${month} *`;
};

const getUploadUrl = (orderNumber: string): string =>
    `${storeUrl}/checkout/pending?order=${encodeURIComponent(orderNumber)}`;

interface OrderRecord {
    id: string;
    status?: string;
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
    return { id: doc.id, status: data.status as string | undefined };
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

const executePaypalProofReminder = async (reminderId: string, job: ScheduledTask) => {
    const reminderRef = firestore.collection(COLLECTION).doc(reminderId);

    try {
        const reminderDoc = await reminderRef.get();
        if (!reminderDoc.exists) {
            job.stop();
            scheduledJobs.delete(reminderId);
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
            job.stop();
            scheduledJobs.delete(reminderId);
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
            uploadUrl: getUploadUrl(reminder.orderNumber),
            proofEmail,
        });

        const emailsSent = (reminder.emailsSent ?? 0) + 1;
        const lastSentAt = new Date();

        await reminderRef.update({
            emailsSent,
            lastSentAt,
        });

        console.log(
            `📧 Recordatorio PayPal #${emailsSent} enviado - orden ${reminder.orderNumber} (${reminderId})`
        );

        job.stop();
        scheduledJobs.delete(reminderId);

        const stillAwaiting = await isOrderAwaitingPaypalProof(reminder.userId, reminder.orderNumber);
        if (!stillAwaiting) {
            await completeReminder(reminderRef, 'order_status_changed_after_send');
            return;
        }

        const nextSendAt = new Date(lastSentAt.getTime() + getDelayForNextEmail(emailsSent));
        await reminderRef.update({ nextSendAt });
        schedulePaypalProofReminderJob(reminderId, nextSendAt);
    } catch (error) {
        console.error(`Error al ejecutar recordatorio PayPal (${reminderId}):`, error);
        await reminderRef.update({
            status: 'error',
            errorAt: new Date(),
            error: String(error),
        });
        job.stop();
        scheduledJobs.delete(reminderId);
    }
};

export const schedulePaypalProofReminderJob = (reminderId: string, sendAt: Date) => {
    stopScheduledJob(reminderId);

    const now = Date.now();
    const effectiveSendAt = sendAt.getTime() <= now
        ? new Date(now + 60 * 1000)
        : sendAt;

    const cronExpr = toCronExpression(effectiveSendAt);

    const job = cron.schedule(
        cronExpr,
        () => executePaypalProofReminder(reminderId, job),
        { timezone }
    );

    scheduledJobs.set(reminderId, job);
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

        const nextSendAt = computeNextSendAt(reminder);
        await doc.ref.update({ nextSendAt });
        schedulePaypalProofReminderJob(doc.id, nextSendAt);
    }

    console.log(`🔄 Recordatorios PayPal activos restaurados: ${snapshot.size}`);
};
