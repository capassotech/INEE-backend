import { Request, Response } from "express";
import { firestore } from '../../config/firebase';
import { Resend } from "resend";
import { MercadoPagoConfig, Payment } from "mercadopago";
import { createOrder, updateOrderStatus } from "../orders/controller";
import crypto from 'crypto';


const mpClient = new MercadoPagoConfig({
    accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN || '',
});

const resend = new Resend(process.env.RESEND_API_KEY);

export const createPayment = async (req: Request, res: Response) => {
    try {
        const {
            items,
            metadata,
            token,
            installments = 1,
            paymentMethodId
        } = req.body;

        console.log(req.body);

        if (!metadata.userId || !Array.isArray(items) || items.length === 0 || !metadata.totalAmount) {
            return res.status(400).json({ error: "Faltan datos de la orden (userId, items, totalPrice)" });
        }

        if (!token || !paymentMethodId) {
            return res.status(400).json({ error: "Faltan datos de pago (token, paymentMethodId)" });
        }

        const user = await firestore.collection('users').doc(metadata.userId).get();
        if (!user.exists) {
            return res.status(400).json({ error: "Usuario no encontrado" });
        }

        if (!await validateProds(items)) {
            return res.status(400).json({ error: "Productos no encontrados" });
        }

        const total = await calculateTotalPrice(items);
        const transactionAmount = total || metadata.totalAmount;

        if (isNaN(transactionAmount) || transactionAmount <= 0) {
            return res.status(400).json({ 
                error: "El monto de la transacción es inválido",
                details: `Monto calculado: ${total}, Monto metadata: ${metadata.totalAmount}`
            });
        }

        const { orderId, orderNumber } = await createOrder(metadata.userId, items, transactionAmount, 'pending');

        const paymentClient = new Payment(mpClient);
        const payment = await paymentClient.create({
            body: {
                transaction_amount: Number(transactionAmount),
                token,
                description: `Compra INEE - Orden ${orderNumber}`,
                installments,
                payment_method_id: paymentMethodId,
                external_reference: orderNumber, // Número de orden visible en MP
                payer: {
                    email: user.data()?.email || '',
                    first_name: user.data()?.nombre || '',
                },
                metadata: {
                    userId: metadata.userId,
                    orderId,
                    orderNumber,
                },
            },
            requestOptions: {
                idempotencyKey: `order-${orderId}-${Date.now()}` 
            }
        });

        const status = payment.status || 'pending';
        const statusDetail = payment.status_detail;

        console.log(`Payment ${payment.id} - Status: ${status}, Detail: ${statusDetail}`);

        await firestore.collection('orders').doc(orderId).update({
            status: status === 'approved' ? 'paid' : status,
            paymentId: payment.id,
            paymentStatus: status,
            paymentDetails: {
                status_detail: statusDetail,
                payment_method_id: payment.payment_method_id,
                payment_type_id: payment.payment_type_id,
            },
            updatedAt: new Date()
        });

        if (status === 'approved') {
            // await assignProductsToUser(metadata.userId, items);
            
            return res.json({
                success: true,
                message: "Pago aprobado exitosamente",
                orderId,
                orderNumber,
                paymentId: payment.id,
                status,
                statusDetail
            });
        }

        if (status === 'rejected') {
            return res.status(400).json({
                success: false,
                message: "Pago rechazado",
                orderId,
                orderNumber,
                paymentId: payment.id,
                status,
                statusDetail,
                errorMessage: getPaymentErrorMessage(statusDetail || 'cc_rejected_other_reason')
            });
        }

        const emailMessage = `
            <p>Hola ${user.data()?.nombre || ''}</p>
            <p>Tu pago ha sido procesado exitosamente. Te informamos que tu orden es la siguiente:</p>
            <p>Orden: ${orderNumber}</p>
            <p>Estado del pago: ${status}</p>
            <p>Fecha de pago: ${new Date().toLocaleDateString('es-ES')}</p>
            <p>Productos:</p>
            <ul>
                ${items.map((item: any) => `<li>${item.nombre} - ${item.precio}</li>`).join('')}
            </ul>
            <p>Total: ${total}</p>
            <p>Medio de pago: ${paymentMethodId}</p>
            <p>Gracias por tu compra. Te esperamos en INEE.</p>
            <p>Atentamente, INEE.</p>
        `;
        
        await resend.emails.send({
            from: "INEE Oficial <contacto@ineeoficial.com>",
            to: user.data()?.email || '',
            subject: "Gracias por tu compra en INEE",
            html: emailMessage
        });

        return res.json({
            success: true,
            message: "Pago en proceso",
            orderId,
            orderNumber,
            paymentId: payment.id,
            status,
            statusDetail
        });
    } catch (err: any) {
        console.error('createPayment error:', err?.response?.data || err);
        return res.status(500).json({ 
            success: false,
            error: "Error al crear el pago", 
            details: err?.message 
        });
    }
}


export const handleWebhook = async (req: Request, res: Response) => {
    try {
        const xSignature = req.headers['x-signature'] as string;
        const xRequestId = req.headers['x-request-id'] as string;
        
        if (!validateWebhookSignature(req.body, xSignature, xRequestId)) {
            console.warn('Firma de webhook inválida');
            return res.sendStatus(401);
        }


    } catch (err) {
        console.error('handleWebhook error:', err);
        return res.sendStatus(500);
    }
};

const validateWebhookSignature = (body: any, signature: string, requestId: string): boolean => {
    const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET || '';
    
    const parts = signature.split(',');
    let ts = '';
    let hash = '';
    
    parts.forEach(part => {
        const [key, value] = part.split('=');
        if (key.trim() === 'ts') ts = value;
        if (key.trim() === 'v1') hash = value;
    });
    
    const manifest = `id:${body.data.id};request-id:${requestId};ts:${ts};`;
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(manifest);
    const calculatedHash = hmac.digest('hex');
    
    return calculatedHash === hash;
};

const calculateTotalPrice = async (items: any[]): Promise<number> => {
    let totalPrice = 0;
    for (const item of items) {
        let price = Number(item.precio || item.price || 0);
        
        if (isNaN(price) || price <= 0) {
            const productId = item.id || item.productId;
            if (!productId) {
                console.warn(`Item sin ID, no se puede obtener precio:`, item);
                continue;
            }

            let productDoc = await firestore.collection('courses').doc(productId).get();
            if (productDoc.exists) {
                const data = productDoc.data();
                price = Number(data?.precio || data?.price || 0);
            } else {
                // Buscar en events
                productDoc = await firestore.collection('events').doc(productId).get();
                if (productDoc.exists) {
                    const data = productDoc.data();
                    price = Number(data?.precio || data?.price || 0);
                } else {
                    // Buscar en ebooks
                    productDoc = await firestore.collection('ebooks').doc(productId).get();
                    if (productDoc.exists) {
                        const data = productDoc.data();
                        price = Number(data?.precio || data?.price || 0);
                    }
                }
            }
        }

        if (isNaN(price) || price <= 0) {
            console.warn(`No se pudo determinar precio válido para item:`, item);
            continue;
        }

        totalPrice += price;
    }
    return totalPrice;
}


const validateProds = async (items: any[]): Promise<boolean> => {
    for (const item of items) {
        const prod = await firestore.collection('courses').doc(item.id).get();
        if (prod.exists) {
            continue; 
        }

        const course = await firestore.collection('events').doc(item.id).get();
        if (course.exists) {
            continue;
        }

        const ebook = await firestore.collection('ebooks').doc(item.id).get();
        if (ebook.exists) {
            continue;
        }

        return false; 
    }
    return true;
}

const assignProductsToUser = async (userId: string, items: any[]): Promise<void> => {
    try {
        const userRef = firestore.collection('users').doc(userId);
        const userDoc = await userRef.get();
        
        if (!userDoc.exists) {
            console.error(`Usuario ${userId} no encontrado`);
            return;
        }

        const userData = userDoc.data();
        const cursosAsignados = userData?.cursos_asignados || [];
        const eventosAsignados = userData?.eventos_asignados || [];
        const ebooksAsignados = userData?.ebooks_asignados || [];

        for (const item of items) {
            const productId = item.id || item.productId;
            
            // Verificar en qué colección está el producto
            const courseDoc = await firestore.collection('courses').doc(productId).get();
            if (courseDoc.exists && !cursosAsignados.includes(productId)) {
                cursosAsignados.push(productId);
                continue;
            }

            const eventDoc = await firestore.collection('events').doc(productId).get();
            if (eventDoc.exists && !eventosAsignados.includes(productId)) {
                eventosAsignados.push(productId);
                continue;
            }

            const ebookDoc = await firestore.collection('ebooks').doc(productId).get();
            if (ebookDoc.exists && !ebooksAsignados.includes(productId)) {
                ebooksAsignados.push(productId);
            }
        }

        // Actualizar el usuario con los nuevos productos asignados
        await userRef.update({
            cursos_asignados: cursosAsignados,
            eventos_asignados: eventosAsignados,
            ebooks_asignados: ebooksAsignados,
            updatedAt: new Date()
        });

        console.log(`Productos asignados al usuario ${userId}:`, {
            cursos: cursosAsignados.length,
            eventos: eventosAsignados.length,
            ebooks: ebooksAsignados.length
        });
    } catch (error) {
        console.error('Error al asignar productos al usuario:', error);
    }
}

const getPaymentErrorMessage = (statusDetail: string): string => {
    const errorMessages: { [key: string]: string } = {
        'cc_rejected_bad_filled_card_number': 'Número de tarjeta inválido',
        'cc_rejected_bad_filled_date': 'Fecha de vencimiento inválida',
        'cc_rejected_bad_filled_other': 'Revisa los datos de tu tarjeta',
        'cc_rejected_bad_filled_security_code': 'Código de seguridad inválido',
        'cc_rejected_blacklist': 'No pudimos procesar tu pago',
        'cc_rejected_call_for_authorize': 'Debes autorizar el pago con tu banco',
        'cc_rejected_card_disabled': 'Tarjeta deshabilitada. Contacta a tu banco',
        'cc_rejected_card_error': 'No pudimos procesar tu tarjeta',
        'cc_rejected_duplicated_payment': 'Ya procesaste un pago similar recientemente',
        'cc_rejected_high_risk': 'Tu pago fue rechazado. Elige otro medio de pago',
        'cc_rejected_insufficient_amount': 'Fondos insuficientes',
        'cc_rejected_invalid_installments': 'La tarjeta no acepta el número de cuotas seleccionado',
        'cc_rejected_max_attempts': 'Has alcanzado el límite de intentos. Elige otra tarjeta',
        'cc_rejected_other_reason': 'Tu banco rechazó el pago. Intenta con otra tarjeta o contacta a tu banco',
    };

    return errorMessages[statusDetail] || 'El pago no pudo ser procesado. Intenta con otro medio de pago';
}