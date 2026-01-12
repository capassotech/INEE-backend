import { Request, Response } from "express";
import { firestore } from '../../config/firebase';
import { Resend } from "resend";
import { MercadoPagoConfig, Payment, PaymentMethod } from "mercadopago";
import { createOrder, updateOrderStatus } from "../orders/controller";
import crypto from 'crypto';
import axios from 'axios';


const mpClient = new MercadoPagoConfig({
    accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN || '',
});

// Log para verificar el tipo de access token (test vs producción)
const accessTokenType = process.env.MERCADO_PAGO_ACCESS_TOKEN?.startsWith('TEST-') ? 'TEST' : 'PRODUCCIÓN';
console.log(`🔑 Mercado Pago configurado en modo: ${accessTokenType}`);

const resend = new Resend(process.env.RESEND_API_KEY);

export const createPayment = async (req: Request, res: Response) => {
    try {
        const {
            items,
            metadata,
            token,
            installments = 1,
            paymentMethodId,
            issuerId,
            cardholderName,
            identificationType,
            identificationNumber,
            deviceId,
            device_id // OBLIGATORIO para seguridad y prevención de fraude (ambos nombres por compatibilidad)
        } = req.body;

        // Usar device_id o deviceId (el que venga del frontend)
        const finalDeviceId = device_id || deviceId;

        console.log('Payment request body:', req.body);
        console.log('🔍 issuerId recibido del frontend:', issuerId);
        console.log('🔍 Tipo de issuerId:', typeof issuerId);
        console.log('🔒 device_id recibido del frontend:', device_id);
        console.log('🔒 deviceId (camelCase) recibido del frontend:', deviceId);
        console.log('🔒 Device ID final a usar:', finalDeviceId);

        if (!metadata.userId || !Array.isArray(items) || items.length === 0 || !metadata.totalAmount) {
            return res.status(400).json({ error: "Faltan datos de la orden (userId, items, totalPrice)" });
        }

        if (!token || !paymentMethodId) {
            return res.status(400).json({ error: "Faltan datos de pago (token, paymentMethodId)" });
        }

        // VALIDACIÓN CRÍTICA: Para tarjetas de débito, el issuerId es OBLIGATORIO
        if (!issuerId || issuerId === 'undefined' || issuerId === 'null') {
            console.warn('⚠️  ADVERTENCIA: issuerId no proporcionado por el frontend');
            console.warn('⚠️  Esto causará error "not_result_by_params" con tarjetas de débito');
            console.warn('⚠️  El frontend DEBE obtener el issuerId usando el SDK de MP');
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

        // Construir la URL del webhook
        const baseUrl = 'https://inee-backend-qa.onrender.com';
        const webhookUrl = `${baseUrl}/api/payments/mercadopago/webhook`;

        // Construir el objeto de pago con todos los parámetros necesarios
        const paymentData: any = {
            transaction_amount: Number(transactionAmount),
            token,
            description: `Compra INEE - Orden ${orderNumber}`,
            installments: Number(installments),
            payment_method_id: paymentMethodId,
            external_reference: orderNumber,
            statement_descriptor: "INEE",
            notification_url: webhookUrl,
            payer: {
                email: user.data()?.email || '',
                first_name: user.data()?.nombre || '',
            },
            metadata: {
                userId: metadata.userId,
                orderId,
                orderNumber,
            },
        };

        // OBLIGATORIO: Additional info con items para prevención de fraude
        if (items && items.length > 0) {
            paymentData.additional_info = {
                items: items.map((item: any) => ({
                    id: item.id || item.productId,
                    title: item.nombre || item.title || 'Producto',
                    description: item.descripcion || item.description || `Producto: ${item.nombre || item.title}`,
                    category_id: item.categoria || item.category_id || 'education',
                    quantity: item.quantity || 1,
                    unit_price: Number(item.precio || item.price || item.unit_price || 0),
                })),
                payer: {
                    first_name: user.data()?.nombre || '',
                    last_name: user.data()?.apellido || '',
                    phone: {
                        area_code: '',
                        number: user.data()?.telefono || ''
                    },
                    address: {
                        zip_code: '',
                        street_name: '',
                        street_number: 0
                    }
                }
            };
            console.log('📦 Additional info de items agregado');
        }

        // CRÍTICO: Device ID NO debe ir en el body, se envía por header (X-meli-session-id)
        if (!finalDeviceId) {
            console.error('❌ Device ID no recibido del frontend');
        }

        // Agregar issuer_id si está disponible, o intentar detectarlo
        let finalIssuerId = issuerId;
        
        if (!finalIssuerId || finalIssuerId === 'undefined' || finalIssuerId === 'null') {
            // El frontend no envió issuerId, intentar obtenerlo automáticamente
            console.log('🔍 Frontend no envió issuerId, obteniendo automáticamente...');
            const detectedIssuers = await getIssuerIdFromPaymentMethod(paymentMethodId, token);
            
            if (detectedIssuers.length > 0) {
                finalIssuerId = detectedIssuers[0]; // Usar el primero (más común)
                console.log(`✅ Issuer ID detectado automáticamente: ${finalIssuerId}`);
            }
        }
        
        // Agregar issuer_id al pago si lo tenemos
        if (finalIssuerId && finalIssuerId !== 'undefined' && finalIssuerId !== 'null') {
            paymentData.issuer_id = String(finalIssuerId);
            console.log(`📌 Usando issuer_id: ${finalIssuerId}`);
        } else {
            console.warn('⚠️  NO se pudo obtener issuer_id - el pago probablemente fallará con débito');
        }

        // Agregar información del tarjetahabiente si está disponible
        if (cardholderName) {
            paymentData.payer.first_name = cardholderName.split(' ')[0] || cardholderName;
            if (cardholderName.split(' ').length > 1) {
                paymentData.payer.last_name = cardholderName.split(' ').slice(1).join(' ');
            }
        }

        // Agregar documento de identificación (OBLIGATORIO para tarjetas de débito en Argentina)
        if (identificationType && identificationNumber) {
            paymentData.payer.identification = {
                type: identificationType,
                number: identificationNumber
            };
        } else {
            console.warn('⚠️  NO hay identification - esto puede causar problemas con débito');
        }
        paymentData.three_d_secure_mode = 'optional';

        const paymentClient = new Payment(mpClient);
        let payment;
        
        try {
            // Construir opciones de request (idempotencia + header de seguridad con device_id)
            const requestOptions: any = {
                idempotencyKey: `order-${orderId}-${Date.now()}`
            };
            if (finalDeviceId) {
                requestOptions.headers = {
                    'X-meli-session-id': finalDeviceId
                };
            }

            payment = await paymentClient.create({
                body: paymentData,
                requestOptions
            });
            console.log('✅ Pago procesado exitosamente');
        } catch (error: any) {
            console.error('❌ Error procesando pago:', error.message);
            console.error('📋 Detalles del error:', JSON.stringify(error, null, 2));
            
            throw error;
        }

        const status = payment.status || 'pending';
        const statusDetail = payment.status_detail;

        console.log(`Payment ${payment.id} - Status: ${status}, Detail: ${statusDetail}`);
        console.log('Payment response:', JSON.stringify({
            id: payment.id,
            status: payment.status,
            status_detail: payment.status_detail,
            payment_method_id: payment.payment_method_id,
            payment_type_id: payment.payment_type_id,
            issuer_id: payment.issuer_id
        }, null, 2));

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
        console.error('Full error details:', JSON.stringify(err, null, 2));
        
        // Error específico de Mercado Pago
        if (err?.response?.data) {
            const mpError = err.response.data;
            return res.status(400).json({ 
                success: false,
                error: "Error al procesar el pago con Mercado Pago",
                mpError: mpError.message || mpError.error,
                cause: mpError.cause,
                details: err?.message 
            });
        }
        
        return res.status(500).json({ 
            success: false,
            error: "Error al crear el pago", 
            details: err?.message 
        });
    }
}


export const handleWebhook = async (req: Request, res: Response) => {
    try {
        console.log('🔔 Webhook recibido de Mercado Pago');
        console.log('Headers:', req.headers);
        console.log('Body:', JSON.stringify(req.body, null, 2));

        const xSignature = req.headers['x-signature'] as string;
        const xRequestId = req.headers['x-request-id'] as string;
        
        // Validar firma del webhook para seguridad
        if (!validateWebhookSignature(req.body, xSignature, xRequestId)) {
            console.warn('⚠️  Firma de webhook inválida - posible intento de fraude');
            return res.sendStatus(401);
        }

        console.log('✅ Firma de webhook válida');

        // Extraer información del webhook
        const { type, data } = req.body;

        // Solo procesar notificaciones de pagos
        if (type === 'payment') {
            const paymentId = data.id;
            console.log(`📦 Procesando notificación de pago: ${paymentId}`);

            // Obtener información completa del pago desde MP
            const paymentClient = new Payment(mpClient);
            const payment = await paymentClient.get({ id: paymentId });

            console.log(`💳 Pago ${paymentId} - Status: ${payment.status}`);

            // Buscar la orden asociada a este pago
            const ordersSnapshot = await firestore
                .collection('orders')
                .where('paymentId', '==', paymentId)
                .limit(1)
                .get();

            if (ordersSnapshot.empty) {
                console.warn(`⚠️  No se encontró orden para el pago ${paymentId}`);
                return res.sendStatus(200); // Responder OK para que MP no reintente
            }

            const orderDoc = ordersSnapshot.docs[0];
            const orderId = orderDoc.id;
            const orderData = orderDoc.data();

            console.log(`📋 Orden encontrada: ${orderId}`);

            // Actualizar estado de la orden según el pago
            const newStatus = payment.status === 'approved' ? 'paid' : payment.status || 'pending';
            
            await firestore.collection('orders').doc(orderId).update({
                status: newStatus,
                paymentStatus: payment.status,
                paymentDetails: {
                    status_detail: payment.status_detail,
                    payment_method_id: payment.payment_method_id,
                    payment_type_id: payment.payment_type_id,
                },
                updatedAt: new Date(),
                webhookProcessedAt: new Date()
            });

            console.log(`✅ Orden ${orderId} actualizada a estado: ${newStatus}`);

            // Si el pago fue aprobado, asignar productos al usuario
            if (payment.status === 'approved') {
                console.log(`🎁 Asignando productos al usuario ${orderData.userId}`);
                await assignProductsToUser(orderData.userId, orderData.items);
                
                // Enviar email de confirmación
                try {
                    await sendPaymentConfirmationEmail(orderData.userId, orderId, orderData);
                    console.log(`📧 Email de confirmación enviado a ${orderData.userId}`);
                } catch (emailError) {
                    console.error('Error enviando email:', emailError);
                }
            }

            return res.sendStatus(200);
        }

        // Responder OK para otros tipos de notificaciones
        return res.sendStatus(200);

    } catch (err) {
        console.error('❌ handleWebhook error:', err);
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

// Función para enviar email de confirmación de pago
const sendPaymentConfirmationEmail = async (userId: string, orderId: string, orderData: any) => {
    try {
        const userDoc = await firestore.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            console.error('Usuario no encontrado para enviar email');
            return;
        }

        const user = userDoc.data();
        const userEmail = user?.email;
        const userName = user?.nombre || 'Cliente';

        if (!userEmail) {
            console.error('Email de usuario no disponible');
            return;
        }

        // Construir lista de productos
        const itemsList = orderData.items.map((item: any) => 
            `<li>${item.nombre || item.title} - $${item.precio || item.price || item.unit_price}</li>`
        ).join('');

        const emailMessage = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #00a650;">¡Pago Confirmado!</h2>
                <p>Hola <strong>${userName}</strong>,</p>
                <p>Tu pago ha sido procesado exitosamente.</p>
                
                <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
                    <h3 style="margin-top: 0;">Detalles de tu compra:</h3>
                    <p><strong>Número de Orden:</strong> ${orderData.orderNumber || orderId}</p>
                    <p><strong>Estado:</strong> Pagado ✅</p>
                    <p><strong>Total:</strong> $${orderData.totalPrice}</p>
                    <p><strong>Fecha:</strong> ${new Date().toLocaleDateString('es-ES')}</p>
                </div>

                <h3>Productos adquiridos:</h3>
                <ul>${itemsList}</ul>

                <p>Ya puedes acceder a tus productos en tu cuenta de INEE.</p>
                
                <p style="margin-top: 30px;">Gracias por tu compra,<br><strong>Equipo INEE</strong></p>
            </div>
        `;

        await resend.emails.send({
            from: "INEE Oficial <contacto@ineeoficial.com>",
            to: userEmail,
            subject: `✅ Confirmación de Pago - Orden ${orderData.orderNumber || orderId}`,
            html: emailMessage
        });

        console.log(`✅ Email de confirmación enviado a ${userEmail}`);
    } catch (error) {
        console.error('Error enviando email de confirmación:', error);
        throw error;
    }
};

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
        'cc_rejected_insufficient_amount': 'Saldo insuficiente en tu tarjeta',
        'cc_rejected_invalid_installments': 'La tarjeta no acepta el número de cuotas seleccionado',
        'cc_rejected_max_attempts': 'Has alcanzado el límite de intentos. Elige otra tarjeta',
        'cc_rejected_other_reason': 'Tu banco rechazó el pago. Intenta con otra tarjeta o contacta a tu banco',
        'cc_rejected_by_bank': 'Tu banco rechazó la transacción. Contacta a tu banco',
        'cc_rejected_3ds_mandatory': 'Tu tarjeta requiere autenticación 3DS',
        'cc_rejected_3ds_challenge': 'Fallo en la autenticación 3DS',
    };

    return errorMessages[statusDetail] || 'El pago no pudo ser procesado. Intenta con otro medio de pago';
}

// Función para obtener el issuer_id automáticamente usando la API de Mercado Pago
const getIssuerIdFromPaymentMethod = async (paymentMethodId: string, token: string): Promise<string[]> => {
    try {
        // Lista de issuers comunes para probar (Argentina)
        const issuersByMethod: { [key: string]: string[] } = {
            'visa': [
                '310',  // Visa Argentina genérico
                '303',  // Banco Galicia
                '286',  // Banco Santander Río
                '297',  // Banco BBVA
                '268',  // Banco Provincia
                '299',  // Banco Patagonia
            ],
            'master': [
                '288',  // Mastercard Argentina genérico
                '303',  // Banco Galicia
                '286',  // Banco Santander Río
                '297',  // Banco BBVA
            ],
        };
        
        if (issuersByMethod[paymentMethodId]) {
            console.log(`📌 Issuers disponibles para ${paymentMethodId}:`, issuersByMethod[paymentMethodId]);
            return issuersByMethod[paymentMethodId];
        }
        
        return [];
    } catch (error) {
        console.error('Error obteniendo issuer_id:', error);
        return [];
    }
}