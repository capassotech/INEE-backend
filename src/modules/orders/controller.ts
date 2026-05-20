import { Request, Response } from "express";
import { firestore } from '../../config/firebase';
import { normalizeText } from "../../utils/utils";
import { cache, CACHE_KEYS } from "../../utils/cache";
import {
    AWAITING_PAYPAL_PROOF_STATUS,
    AWAITING_VERIFICATION_STATUS,
    CreatePaypalOrderSchema,
    SubmitPaypalProofSchema,
} from "../../types/orders";
import { AuthenticatedRequest } from "../../middleware/authMiddleware";
import { uploadPaypalProofToStorage } from "../../utils/paypalProofStorage";
import { sendPaypalProofSubmittedAdminEmail } from "../emails/paypalProofSubmittedAdminEmail";
import { cancelActivePaypalProofReminders } from "../recordatorios/paypalProofReminderScheduler";
import { getPaypalProofFileFromRequest } from "./paypalProofUpload";

const collection = firestore.collection('orders');

const getAdminOrderDetailUrl = (orderId: string): string => {
    const isProduction = process.env.FIREBASE_PROJECT_ID === 'inee-admin';
    const adminPanelUrl =
        process.env.ADMIN_PANEL_URL ||
        (isProduction ? 'https://admin.ineeoficial.com' : 'https://admin-qa.ineeoficial.com');
    const orderPath = process.env.ADMIN_ORDER_DETAIL_PATH || '/orders';
    const normalizedPath = orderPath.startsWith('/') ? orderPath : `/${orderPath}`;
    return `${adminPanelUrl.replace(/\/$/, '')}${normalizedPath}/${orderId}`;
};

export const createOrder = async (
    userId: string, 
    items: any[], 
    totalPrice: number, 
    status: string, 
    discountCode?: string,
    originalPrice?: number
) => {
    const year = new Date().getFullYear();
    const orderNumber = `ORD-${year}-${Date.now().toString().slice(-6)}`;
    
    const orderData: any = {
        userId,
        items,
        totalPrice,
        createdAt: new Date(),
        status,
        orderNumber
    };

    // Si hay código de descuento, guardarlo
    if (discountCode) {
        orderData.discountCode = discountCode;
        console.log(`✅ Orden creada con código de descuento: ${discountCode}`);
    }

    // Si hay precio original (sin descuento), guardarlo también
    if (originalPrice && originalPrice !== totalPrice) {
        orderData.originalPrice = originalPrice;
        console.log(`💰 Precio original: ${originalPrice}, Precio con descuento: ${totalPrice}`);
    }
    
    const order = await collection.add(orderData);
    cache.invalidatePattern(`${CACHE_KEYS.ORDERS}:`);
    
    return { orderId: order.id, orderNumber };
}

export const updateOrderStatus = async (orderId: string, status: string) => {
    const order = await collection.doc(orderId).update({ status });
    cache.invalidatePattern(`${CACHE_KEYS.ORDERS}:`);
    return order;
}

export const updatePreferenceId = async (orderId: string, preferenceId: string) => {
    const order = await collection.doc(orderId).update({ preferenceId });
    cache.invalidatePattern(`${CACHE_KEYS.ORDERS}:`);
    return order;
}


export const getOrders = async (req: Request, res: Response) => {
    try {
        const limit = Math.min(parseInt(req.query.limit as string || '20'), 100); 
        const lastId = req.query.lastId as string | undefined;
        const pageQuery = req.query.page as string | undefined;
        const page = pageQuery ? Math.max(parseInt(pageQuery, 10) || 1, 1) : undefined;
        const search = req.query.search as string | undefined;
        const discountCode = req.query.discountCode as string | undefined;
        
        const shouldCache = !search && !lastId && !page && !discountCode;
        
        if (shouldCache) {
            const cacheKey = cache.generateKey(CACHE_KEYS.ORDERS, { limit });
            const cached = cache.get(cacheKey);
            if (cached) {
                return res.json(cached);
            }
        }
        
        const queryLimit = (search && search.trim()) || discountCode ? limit * 3 : limit; 
        
        let snapshot: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>;
        
        // Si hay discountCode, filtrar por ese campo
        if (discountCode) {
            console.log(`🔍 Filtrando órdenes por discountCode: ${discountCode}`);
            
            if (page && page > 1) {
                const skipCount = (page - 1) * limit;
                
                if (skipCount <= 50 * limit) {
                    let currentQuery = collection
                        .where('discountCode', '==', discountCode)
                        .orderBy('createdAt', 'desc')
                        .limit(skipCount);
                    let skipSnapshot = await currentQuery.get();
                    
                    if (skipSnapshot.docs.length === skipCount) {
                        const lastDocForPagination = skipSnapshot.docs[skipSnapshot.docs.length - 1];
                        const extendedQuery = collection
                            .where('discountCode', '==', discountCode)
                            .orderBy('createdAt', 'desc')
                            .startAfter(lastDocForPagination)
                            .limit(queryLimit + 1);
                        snapshot = await extendedQuery.get();
                    } else {
                        const emptyQuery = collection
                            .where('discountCode', '==', discountCode)
                            .orderBy('createdAt', 'desc')
                            .limit(0);
                        snapshot = await emptyQuery.get();
                    }
                } else {
                    const emptyQuery = collection
                        .where('discountCode', '==', discountCode)
                        .orderBy('createdAt', 'desc')
                        .limit(0);
                    snapshot = await emptyQuery.get();
                }
            } else if (lastId) {
                const lastDoc = await collection.doc(lastId).get();
                if (lastDoc.exists) {
                    const extendedQuery = collection
                        .where('discountCode', '==', discountCode)
                        .orderBy('createdAt', 'desc')
                        .startAfter(lastDoc)
                        .limit(queryLimit + 1);
                    snapshot = await extendedQuery.get();
                } else {
                    const emptyQuery = collection
                        .where('discountCode', '==', discountCode)
                        .orderBy('createdAt', 'desc')
                        .limit(0);
                    snapshot = await emptyQuery.get();
                }
            } else {
                const extendedQuery = collection
                    .where('discountCode', '==', discountCode)
                    .orderBy('createdAt', 'desc')
                    .limit(queryLimit + 1);
                snapshot = await extendedQuery.get();
            }
        } else if (page && page > 1) {
            const skipCount = (page - 1) * limit;
            
            if (skipCount <= 50 * limit) {
                let currentQuery = collection.orderBy('createdAt', 'desc').limit(skipCount);
                let skipSnapshot = await currentQuery.get();
                
                if (skipSnapshot.docs.length === skipCount) {
                    const lastDocForPagination = skipSnapshot.docs[skipSnapshot.docs.length - 1];
                    const extendedQuery = collection.orderBy('createdAt', 'desc')
                        .startAfter(lastDocForPagination)
                        .limit(queryLimit + 1);
                    snapshot = await extendedQuery.get();
                } else {
                    const emptyQuery = collection.orderBy('createdAt', 'desc').limit(0);
                    snapshot = await emptyQuery.get();
                }
            } else {
                const emptyQuery = collection.orderBy('createdAt', 'desc').limit(0);
                snapshot = await emptyQuery.get();
            }
        } else if (lastId) {
            const lastDoc = await collection.doc(lastId).get();
            if (lastDoc.exists) {
                const extendedQuery = collection.orderBy('createdAt', 'desc')
                    .startAfter(lastDoc)
                    .limit(queryLimit + 1);
                snapshot = await extendedQuery.get();
            } else {
                const emptyQuery = collection.orderBy('createdAt', 'desc').limit(0);
                snapshot = await emptyQuery.get();
            }
        } else {
            const extendedQuery = collection.orderBy('createdAt', 'desc').limit(queryLimit + 1);
            snapshot = await extendedQuery.get();
        }

        if (snapshot.empty) {
            return res.json({
                orders: [],
                pagination: {
                    hasMore: false,
                    lastId: null,
                    limit,
                    count: 0
                }
            });
        }

        const docs = snapshot.docs.slice(0, queryLimit);
        let orders = docs.map((doc) => ({ 
            id: doc.id, 
            ...doc.data() 
        }));
        
        if (search && search.trim()) {
            const searchNormalized = normalizeText(search);
            orders = orders.filter((order: any) => {
                const orderNumber = normalizeText(order.orderNumber || '');
                const userId = normalizeText(order.userId || '');
                return orderNumber.includes(searchNormalized) || userId.includes(searchNormalized);
            });
            orders = orders.slice(0, limit);
        } else {
            orders = orders.slice(0, limit);
        }
        
        const lastDoc = docs[docs.length - 1];
        const hasMore = snapshot.docs.length > queryLimit;

        // Enriquecer las órdenes con información de uso de código de descuento
        const ordersWithDiscountInfo = await Promise.all(orders.map(async (order: any) => {
            // Buscar si existe un registro de uso de código de descuento para esta orden
            const discountCodeUsageSnapshot = await firestore
                .collection('discount_code_usage')
                .where('orderId', '==', order.id)
                .limit(1)
                .get();
            
            if (!discountCodeUsageSnapshot.empty) {
                const discountUsageData = discountCodeUsageSnapshot.docs[0].data();
                // Agregar la información del descuento a la orden
                return {
                    ...order,
                    discountInfo: {
                        discountedAmount: discountUsageData.discountedAmount,
                        originalAmount: discountUsageData.originalAmount,
                        savedAmount: discountUsageData.savedAmount,
                        discountPercentage: discountUsageData.discountPercentage,
                        usedAt: discountUsageData.usedAt
                    }
                };
            }
            
            return order;
        }));
        
        const response = {
            orders: ordersWithDiscountInfo,
            pagination: {
                hasMore,
                lastId: lastDoc?.id,
                limit,
                count: ordersWithDiscountInfo.length,
                ...(page && { page, totalPages: hasMore ? page + 1 : page })
            }
        };
        
        if (shouldCache) {
            const cacheKey = cache.generateKey(CACHE_KEYS.ORDERS, { limit });
            cache.set(cacheKey, response, 300); 
        }
        
        return res.json(response);
    } catch (error) {
        console.error('getOrders error:', error);
        return res.status(500).json({ error: 'Error al obtener órdenes' });
    }
}

export const getOrderById = async (req: Request, res: Response) => {
    try {
        const { orderId } = req.params;
        const order = await collection.doc(orderId).get();
        
        if (!order.exists) {
            return res.status(404).json({ error: "Orden no encontrada" });
        }
        
        const orderData = { id: order.id, ...order.data() };
        
        // Buscar si existe un registro de uso de código de descuento para esta orden
        const discountCodeUsageSnapshot = await firestore
            .collection('discount_code_usage')
            .where('orderId', '==', orderId)
            .limit(1)
            .get();
        
        if (!discountCodeUsageSnapshot.empty) {
            const discountUsageData = discountCodeUsageSnapshot.docs[0].data();
            // Agregar la información del descuento a la orden
            return res.json({
                ...orderData,
                discountInfo: {
                    discountedAmount: discountUsageData.discountedAmount,
                    originalAmount: discountUsageData.originalAmount,
                    savedAmount: discountUsageData.savedAmount,
                    discountPercentage: discountUsageData.discountPercentage,
                    usedAt: discountUsageData.usedAt
                }
            });
        }
        
        return res.json(orderData);
    } catch (error) {
        console.error('getOrderById error:', error);
        return res.status(500).json({ error: 'Error al obtener orden' });
    }
}

export const createPaypalOrder = async (req: Request, res: Response) => {
    try {
        const validationResult = CreatePaypalOrderSchema.safeParse(req.body);
        
        if (!validationResult.success) {
            const errors = validationResult.error.issues.map((err: any) => ({
                field: err.path.join('.'),
                message: err.message
            }));
            
            return res.status(400).json({ 
                error: 'Datos de validación inválidos',
                details: errors
            });
        }
        
        const { userId, items, totalPrice, discountCode, originalPrice } = validationResult.data;
        
        const year = new Date().getFullYear();
        const orderNumber = `ORD-${year}-${Date.now().toString().slice(-6)}`;
        
        const orderData: any = {
            userId,
            items,
            totalPrice,
            createdAt: new Date(),
            status: AWAITING_PAYPAL_PROOF_STATUS,
            paymentMethod: 'paypal_manual',
            orderNumber
        };
        
        if (discountCode) {
            orderData.discountCode = discountCode;
            console.log(`✅ Orden PayPal creada con código de descuento: ${discountCode}`);
        }
        
        if (originalPrice && originalPrice !== totalPrice) {
            orderData.originalPrice = originalPrice;
            console.log(`💰 Precio original: ${originalPrice}, Precio con descuento: ${totalPrice}`);
        }
        
        const order = await collection.add(orderData);
        cache.invalidatePattern(`${CACHE_KEYS.ORDERS}:`);
        
        console.log(`📦 Orden PayPal creada exitosamente: ${orderNumber} (ID: ${order.id})`);
        
        return res.status(201).json({ 
            success: true,
            message: 'Orden de PayPal creada exitosamente',
            orderId: order.id,
            orderNumber: orderNumber,
            status: AWAITING_PAYPAL_PROOF_STATUS
        });
        
    } catch (error) {
        console.error('createPaypalOrder error:', error);
        return res.status(500).json({ 
            error: 'Error al crear la orden de PayPal' 
        });
    }
}

export const submitPaypalProof = async (req: AuthenticatedRequest, res: Response) => {
    try {
        if (!process.env.RESEND_API_KEY) {
            return res.status(500).json({ error: 'Configuración de email inválida' });
        }

        const validationResult = SubmitPaypalProofSchema.safeParse(req.body);

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

        const file = getPaypalProofFileFromRequest(req);
        if (!file?.buffer?.length) {
            return res.status(400).json({
                error: 'Comprobante requerido',
                details: 'Enviá el archivo como multipart con el campo "proof", "file" o "comprobante"',
            });
        }

        const { orderId } = validationResult.data;
        const userId = req.user.uid;

        const orderDoc = await collection.doc(orderId).get();
        if (!orderDoc.exists) {
            return res.status(404).json({ error: 'Orden no encontrada' });
        }

        const orderData = orderDoc.data() as {
            userId?: string;
            orderNumber?: string;
            status?: string;
            totalPrice?: number;
            originalPrice?: number;
            discountCode?: string;
            items?: Array<{
                title?: string;
                description?: string;
                quantity?: number;
                unit_price?: number;
            }>;
        };

        if (orderData.userId !== userId) {
            return res.status(403).json({ error: 'No tenés permiso para enviar comprobante de esta orden' });
        }

        if (orderData.status === AWAITING_VERIFICATION_STATUS) {
            return res.status(200).json({
                success: true,
                message: 'El comprobante ya fue enviado y la orden está en verificación',
                orderId,
                orderNumber: orderData.orderNumber,
                status: AWAITING_VERIFICATION_STATUS,
                redirectTo: '/',
            });
        }

        if (orderData.status !== AWAITING_PAYPAL_PROOF_STATUS) {
            return res.status(400).json({
                error: 'La orden no está pendiente de comprobante PayPal',
                currentStatus: orderData.status,
            });
        }

        const userDoc = await firestore.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        const userData = userDoc.data() as {
            email?: string;
            nombre?: string;
            apellido?: string;
        };

        const userEmail = userData.email || req.user.email || '';
        if (!userEmail) {
            return res.status(400).json({ error: 'El usuario no tiene email registrado' });
        }

        const userName = [userData.nombre, userData.apellido].filter(Boolean).join(' ').trim()
            || userData.nombre
            || 'Usuario';

        const orderNumber = orderData.orderNumber || orderId;
        const proofUrl = await uploadPaypalProofToStorage(orderId, file);

        await sendPaypalProofSubmittedAdminEmail({
            userName,
            userEmail,
            userId,
            orderId,
            orderNumber,
            totalPrice: Number(orderData.totalPrice ?? 0),
            originalPrice: orderData.originalPrice,
            discountCode: orderData.discountCode,
            proofUrl,
            adminOrderDetailUrl: getAdminOrderDetailUrl(orderId),
            items: orderData.items,
        });

        await orderDoc.ref.update({
            status: AWAITING_VERIFICATION_STATUS,
            proofUrl,
            proofSubmittedAt: new Date(),
            updatedAt: new Date(),
        });

        cache.invalidatePattern(`${CACHE_KEYS.ORDERS}:`);

        if (orderNumber) {
            await cancelActivePaypalProofReminders(userId, orderNumber, 'proof_submitted');
        }

        console.log(`✅ Comprobante PayPal enviado - orden ${orderNumber} (${orderId})`);

        return res.status(200).json({
            success: true,
            message: 'Comprobante enviado correctamente. Revisaremos tu pago a la brevedad.',
            orderId,
            orderNumber,
            status: AWAITING_VERIFICATION_STATUS,
            redirectTo: '/',
        });
    } catch (error) {
        console.error('submitPaypalProof error:', error);
        const message =
            error instanceof Error ? error.message : 'Error al enviar el comprobante de pago';

        if (
            message.includes('no permitido') ||
            message.includes('tamaño máximo') ||
            message.includes('vacío')
        ) {
            return res.status(400).json({ error: message });
        }

        return res.status(500).json({ error: message });
    }
};