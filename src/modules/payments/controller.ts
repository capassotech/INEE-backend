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
            userId,
            items,
            totalPrice,
            token,
            paymentMethodId,
            installments = 1,
            issuerId,
        } = req.body;

        if (!userId || !Array.isArray(items) || items.length === 0 || !totalPrice) {
            return res.status(400).json({ error: "Faltan datos de la orden (userId, items, totalPrice)" });
        }

        if (!token || !paymentMethodId) {
            return res.status(400).json({ error: "Faltan datos de pago (token, paymentMethodId)" });
        }

        const user = await firestore.collection('users').doc(userId).get();
        if (!user.exists) {
            return res.status(400).json({ error: "Usuario no encontrado" });
        }

        if (!await validateProds(items)) {
            return res.status(400).json({ error: "Productos no encontrados" });
        }

        const total = await calculateTotalPrice(items);
        const transactionAmount = total || totalPrice;

        const orderId = await createOrder(userId, items, transactionAmount, 'pending');

        const paymentClient = new Payment(mpClient);
        const payment = await paymentClient.create({
            body: {
                transaction_amount: Number(transactionAmount),
                token,
                description: "Compra INEE",
                installments,
                payment_method_id: paymentMethodId,
                issuer_id: issuerId,
                payer: {
                    email: user.data()?.email || '',
                    first_name: user.data()?.nombre || '',
                },
                metadata: {
                    userId,
                    orderId,
                },
            },
            requestOptions: {
                idempotencyKey: `order-${orderId}-${Date.now()}` 
            }
        });

        const status = payment.status || 'pending';

        await firestore.collection('orders').doc(orderId).update({
            status: status === 'approved' ? 'paid' : status,
            paymentId: payment.id,
            paymentStatus: status,
            paymentDetails: {
                status_detail: payment.status_detail,
                payment_method_id: payment.payment_method_id,
                payment_type_id: payment.payment_type_id,
            }
        });

        if (status === 'approved') {
            // TODO: asignar cursos / membresías al usuario según items
        }

        return res.json({
            message: "Payment created",
            orderId,
            paymentId: payment.id,
            status,
        });
    } catch (err: any) {
        console.error('createPayment error:', err?.response?.data || err);
        return res.status(500).json({ error: "Error al crear el pago", details: err?.message });
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
        totalPrice += item.precio;
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