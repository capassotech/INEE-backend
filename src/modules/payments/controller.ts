import { Request, Response } from "express";
import { firestore } from "../../config/firebase";
import { Resend } from "resend";
import { MercadoPagoConfig, Payment, Preference } from "mercadopago";
import { createOrder, updatePreferenceId } from "../orders/controller";
import crypto from 'crypto';


const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN || "",
  options: {
    timeout: 5000,
  },
});

const preferenceClient = new Preference(mpClient);

const resend = new Resend(process.env.RESEND_API_KEY);

export const createPreference = async (req: Request, res: Response) => {
  try {
    if (!process.env.MERCADO_PAGO_ACCESS_TOKEN) {
      console.error("❌ MERCADO_PAGO_ACCESS_TOKEN no configurado");
      return res.status(500).json({
        success: false,
        error: "Error de configuración del servidor",
      });
    }

    const { items, metadata } = req.body;

    if (
      !metadata?.userId ||
      !Array.isArray(items) ||
      items.length === 0 ||
      !metadata.totalAmount
    ) {
      return res.status(400).json({
        success: false,
        error:
          "Faltan datos de la orden (userId, items, totalAmount) para crear la preferencia",
      });
    }

    const userRef = firestore.collection("users").doc(metadata.userId);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return res.status(400).json({ success: false, error: "Usuario no encontrado" });
    }

    if (!(await validateProds(items))) {
      return res
        .status(400)
        .json({ success: false, error: "Productos no encontrados" });
    }

    const total = await calculateTotalPrice(items);
    const transactionAmount = total || metadata.totalAmount;

    if (isNaN(transactionAmount) || transactionAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: "El monto de la transacción es inválido",
        details: `Monto calculado: ${total}, Monto metadata: ${metadata.totalAmount}`,
      });
    }

    const { orderId, orderNumber } = await createOrder(
      metadata.userId,
      items,
      transactionAmount,
      "pending"
    );

    const isProduction = !process.env.MERCADO_PAGO_ACCESS_TOKEN?.startsWith(
      "TEST-"
    );
    const baseUrl = isProduction
      ? process.env.WEBHOOK_BASE_URL || "https://inee-backend.onrender.com"
      : "https://inee-backend-qa.onrender.com";
    const webhookUrl = `${baseUrl}/api/payments/mercadopago/webhook`;

    const frontendUrl =
      process.env.FRONTEND_URL ||
      (isProduction
        ? "https://ineeoficial.com"
        : "https://qa.ineeoficial.com");

    const mpItems = items.map((item: any) => {
      const rawUnitPrice =
        item.unit_price !== undefined && item.unit_price !== null
          ? item.unit_price
          : item.precio ?? item.price ?? 0;

      const unitPrice = Number(rawUnitPrice);

      if (isNaN(unitPrice) || unitPrice <= 0) {
        console.warn("⚠️ unit_price inválido en item, será 0 (MP lo rechazará):", {
          item,
          rawUnitPrice,
        });
      }

      return {
        id: String(item.id || ""),
        title: String(item.nombre || item.title || "Producto"),
        description: String(
          item.description || `Producto: ${item.nombre || item.title}`
        ),
        category_id: "education",
        quantity: Number(item.quantity || 1),
        unit_price: unitPrice,
        currency_id: "ARS",
      };
    });

    const successUrl = `${frontendUrl}/checkout/success?order=${orderNumber}`;
    const pendingUrl = `${frontendUrl}/checkout/pending?order=${orderNumber}`;
    const failureUrl = `${frontendUrl}/checkout/failure?order=${orderNumber}`;

    console.log("🔗 URLs de retorno Checkout PRO:", {
      frontendUrl,
      successUrl,
      pendingUrl,
      failureUrl,
    });

    const preferenceBody: any = {
      items: mpItems,
      external_reference: orderNumber,
      statement_descriptor: "INEE",
      notification_url: webhookUrl,
      back_urls: {
        success: successUrl,
        pending: pendingUrl,
        failure: failureUrl,
      },
      metadata: {
        ...metadata,
        userId: metadata.userId,
        orderId,
        orderNumber,
        items,
      },
    };

    console.log("🧾 Creando preferencia de Mercado Pago Checkout PRO:", {
      orderId,
      orderNumber,
      transactionAmount,
      items: mpItems.length,
      frontendUrl,
      webhookUrl,
    });

    const preference = await preferenceClient.create({ body: preferenceBody });

    if (preference.id) await updatePreferenceId(orderId, preference.id)

    return res.json({
      success: true,
      message: "Preferencia creada correctamente",
      preferenceId: preference.id,
      initPoint: (preference as any).init_point,
      sandboxInitPoint: (preference as any).sandbox_init_point,
      orderId,
      orderNumber,
    });
  } catch (err: any) {
    console.error("❌ Error al crear preferencia de Mercado Pago:", err);
    return res.status(500).json({
      success: false,
      error: "Error al crear la preferencia de pago",
      details: err?.message || "Error inesperado",
    });
  }
};


export const handleWebhook = async (req: Request, res: Response) => {
    try {
        console.log('🔔 Webhook recibido de Mercado Pago');
        console.log('Headers:', req.headers);
        console.log('Body:', JSON.stringify(req.body, null, 2));

        const xSignature = req.headers['x-signature'] as string;
        const xRequestId = req.headers['x-request-id'] as string;

        if (!validateWebhookSignature(req.body, xSignature, xRequestId)) {
            console.warn('⚠️  Firma de webhook inválida - posible intento de fraude');
            return res.sendStatus(401);
        }

        console.log('✅ Firma de webhook válida');

        const { type, data } = req.body;

        if (type === 'payment') {
            const paymentId = data.id;
            console.log(`📦 Procesando notificación de pago: ${paymentId}`);

            const paymentClient = new Payment(mpClient);
            const payment = await paymentClient.get({ id: paymentId });

            console.log(`💳 Pago ${paymentId} - Status: ${payment.status}`);

            let ordersSnapshot = await firestore
                .collection("orders")
                .where("paymentId", "==", paymentId)
                .limit(1)
                .get();

            // 2) Si no hay resultados, intentar por external_reference (Checkout PRO)
            if (ordersSnapshot.empty) {
                const externalReference = payment.external_reference;
                console.log(
                    `⚠️  No se encontró orden por paymentId=${paymentId}. Probando con external_reference=${externalReference}`
                );

                if (externalReference) {
                    ordersSnapshot = await firestore
                        .collection("orders")
                        .where("orderNumber", "==", externalReference)
                        .limit(1)
                        .get();
                }
            }

            if (ordersSnapshot.empty) {
                console.warn(
                    `⚠️  No se encontró orden para el pago ${paymentId} (ni por paymentId ni por external_reference)`
                );
                return res.sendStatus(200); 
            }

            const orderDoc = ordersSnapshot.docs[0];
            const orderId = orderDoc.id;
            const orderData = orderDoc.data();

            console.log(`📋 Orden encontrada: ${orderId}`);

            const newStatus = payment.status === 'approved' ? 'paid' : payment.status || 'pending';

            await firestore.collection('orders').doc(orderId).update({
                status: newStatus,
                paymentStatus: payment.status,
                paymentId,
                paymentDetails: {
                    status_detail: payment.status_detail,
                    payment_method_id: payment.payment_method_id,
                    payment_type_id: payment.payment_type_id,
                },
                updatedAt: new Date(),
                webhookProcessedAt: new Date()
            });

            if (payment.status === 'approved') {
                console.log("pago aprobado, enviando mail de confirmacion");
                // console.log(`🎁 Asignando productos al usuario ${orderData.userId}`);
                // await assignProductsToUser(orderData.userId, orderData.items);

                try {
                    await sendPaymentConfirmationEmail(orderData.userId, orderId, orderData);
                    console.log(`📧 Email de confirmación enviado a ${orderData.userId}`);
                } catch (emailError) {
                    console.error('Error enviando email:', emailError);
                }
            }

            return res.sendStatus(200);
        }

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
};

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
};

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
};

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
        const itemsList = orderData.map((item: any) =>
            `<li>${item.nombre || item.title} - $${item.precio || item.price || item.unit_price}</li>`
        ).join('');

        let total = orderData.reduce((acc: number, item: any) => acc + (item.unit_price * item.quantity), 0);

        const emailMessage = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #00a650;">¡Pago Confirmado!</h2>
                <p>Hola <strong>${userName}</strong>,</p>
                <p>Tu pago ha sido procesado exitosamente.</p>
                
                <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
                    <h3 style="margin-top: 0;">Detalles de tu compra:</h3>
                    <p><strong>Número de Orden:</strong> ${orderData.orderNumber || orderId}</p>
                    <p><strong>Estado:</strong> Pagado ✅</p>
                    <p><strong>Total:</strong> $${total}</p>
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