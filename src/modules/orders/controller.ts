import { Request, Response } from "express";
import { Timestamp } from "firebase-admin/firestore";
import { firestore } from '../../config/firebase';
import { normalizeText, validateUser } from "../../utils/utils";
import { cache, CACHE_KEYS } from "../../utils/cache";
import {
  paginateByCursor,
  paginateByPage,
  parseLimit,
  parsePage,
} from "../../utils/listQuery";
import {
    AssignPaypalOrderProductsSchema,
    AWAITING_PAYPAL_PROOF_STATUS,
    AWAITING_VERIFICATION_STATUS,
    CreatePaypalOrderSchema,
    SubmitPaypalProofSchema,
    UpdatePaypalOrderStatusSchema,
} from "../../types/orders";
import { AuthenticatedRequest } from "../../middleware/authMiddleware";
import { enrichOrderResponse } from "../../utils/orderEnrichment";
import { isPaypalManualOrder, PAYMENT_METHOD_MERCADOPAGO } from "../../utils/orderPaymentMethod";
import { assignProductsToUser } from "../../services/assignProductsToUser";
import { registerDiscountCodeUsage } from "../../services/discountCodeUsage";
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
    originalPrice?: number,
    paymentMethod: string = PAYMENT_METHOD_MERCADOPAGO
) => {
    const year = new Date().getFullYear();
    const orderNumber = `ORD-${year}-${Date.now().toString().slice(-6)}`;
    
    const orderData: any = {
        userId,
        items,
        totalPrice,
        createdAt: new Date(),
        status,
        orderNumber,
        paymentMethod,
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


const enrichOrdersList = async (orders: Array<Record<string, unknown>>) => {
    const ordersWithDiscountInfo = await Promise.all(
        orders.map(async (order) => {
            const discountCodeUsageSnapshot = await firestore
                .collection('discount_code_usage')
                .where('orderId', '==', order.id)
                .limit(1)
                .get();

            if (!discountCodeUsageSnapshot.empty) {
                const discountUsageData = discountCodeUsageSnapshot.docs[0].data();
                return {
                    ...order,
                    discountInfo: {
                        discountedAmount: discountUsageData.discountedAmount,
                        originalAmount: discountUsageData.originalAmount,
                        savedAmount: discountUsageData.savedAmount,
                        discountPercentage: discountUsageData.discountPercentage,
                        usedAt: discountUsageData.usedAt,
                    },
                };
            }

            return order;
        })
    );

    return ordersWithDiscountInfo.map((order) =>
        enrichOrderResponse(order as Record<string, unknown>)
    );
};

export const getOrders = async (req: Request, res: Response) => {
    try {
        const limit = parseLimit(req.query.limit as string);
        const lastId = req.query.lastId as string | undefined;
        const page = req.query.page ? parsePage(req.query.page as string) : undefined;
        const search = req.query.search as string | undefined;
        const discountCode = req.query.discountCode as string | undefined;
        const status = req.query.status as string | undefined;
        const excludeStatus = req.query.excludeStatus as string | undefined;

        const hasAdvancedFilters = Boolean(
            search?.trim() || discountCode || status || excludeStatus || page
        );

        let query: FirebaseFirestore.Query = collection.orderBy('createdAt', 'desc');

        if (discountCode) {
            query = query.where('discountCode', '==', discountCode);
        } else if (status) {
            query = query.where('status', '==', status);
        }

        let orders: Array<Record<string, unknown> & { id: string }> = hasAdvancedFilters
            ? (await query.limit(2000).get()).docs.map((doc) => ({
                id: doc.id,
                ...(doc.data() as Record<string, unknown>),
            }))
            : (await (lastId
                ? query.startAfter(await collection.doc(lastId).get()).limit(limit + 1)
                : query.limit(limit + 1)
              ).get()).docs.map((doc) => ({
                id: doc.id,
                ...(doc.data() as Record<string, unknown>),
            }));

        if (status) {
            orders = orders.filter((order) => order.status === status);
        }
        if (excludeStatus) {
            orders = orders.filter((order) => order.status !== excludeStatus);
        }
        if (discountCode) {
            orders = orders.filter((order) => order.discountCode === discountCode);
        }
        if (search?.trim()) {
            const searchNormalized = normalizeText(search);
            orders = orders.filter((order) => {
                const orderNumber = normalizeText(String(order.orderNumber || ''));
                const userId = normalizeText(String(order.userId || ''));
                return orderNumber.includes(searchNormalized) || userId.includes(searchNormalized);
            });
        }

        let pageOrders = orders;
        let pagination: Record<string, unknown>;

        if (page) {
            const paginated = paginateByPage(orders, page, limit);
            pageOrders = paginated.items;
            pagination = {
                page,
                totalPages: paginated.totalPages,
                total: paginated.total,
                hasMore: paginated.hasMore,
                limit,
                count: paginated.items.length,
            };
        } else if (hasAdvancedFilters) {
            const paginated = paginateByCursor(
                orders.map((order) => ({ ...order, id: String(order.id) })),
                limit,
                lastId
            );
            pageOrders = paginated.items;
            pagination = {
                hasMore: paginated.hasMore,
                lastId: paginated.lastId,
                limit,
                count: paginated.items.length,
            };
        } else {
            const hasMore = orders.length > limit;
            pageOrders = orders.slice(0, limit);
            pagination = {
                hasMore,
                lastId: pageOrders[pageOrders.length - 1]?.id ?? null,
                limit,
                count: pageOrders.length,
            };
        }

        const enrichedOrders = await enrichOrdersList(pageOrders as Array<Record<string, unknown>>);

        return res.json({
            orders: enrichedOrders,
            pagination,
        });
    } catch (error) {
        console.error('getOrders error:', error);
        return res.status(500).json({ error: 'Error al obtener órdenes' });
    }
};

export const getOrdersCount = async (req: Request, res: Response) => {
    try {
        const sinceParam = req.query.since as string | undefined;
        if (!sinceParam) {
            return res.status(400).json({ error: 'El parámetro since es requerido' });
        }

        const since = new Date(sinceParam);
        if (Number.isNaN(since.getTime())) {
            return res.status(400).json({ error: 'El parámetro since debe ser una fecha ISO válida' });
        }

        const snapshot = await collection
            .where('createdAt', '>', Timestamp.fromDate(since))
            .count()
            .get();

        return res.json({ count: snapshot.data().count });
    } catch (error) {
        console.error('getOrdersCount error:', error);
        return res.status(500).json({ error: 'Error al contar órdenes' });
    }
};

export const getOrderById = async (req: Request, res: Response) => {
    try {
        const { orderId } = req.params;
        const order = await collection.doc(orderId).get();
        
        if (!order.exists) {
            return res.status(404).json({ error: "Orden no encontrada" });
        }
        
        const rawOrderData = { id: order.id, ...order.data() } as Record<string, unknown>;
        
        // Buscar si existe un registro de uso de código de descuento para esta orden
        const discountCodeUsageSnapshot = await firestore
            .collection('discount_code_usage')
            .where('orderId', '==', orderId)
            .limit(1)
            .get();
        
        if (!discountCodeUsageSnapshot.empty) {
            const discountUsageData = discountCodeUsageSnapshot.docs[0].data();
            return res.json(
                enrichOrderResponse({
                    ...rawOrderData,
                    discountInfo: {
                        discountedAmount: discountUsageData.discountedAmount,
                        originalAmount: discountUsageData.originalAmount,
                        savedAmount: discountUsageData.savedAmount,
                        discountPercentage: discountUsageData.discountPercentage,
                        usedAt: discountUsageData.usedAt,
                    },
                })
            );
        }
        
        return res.json(enrichOrderResponse(rawOrderData));
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

const requireAdmin = async (req: AuthenticatedRequest, res: Response): Promise<boolean> => {
    const isAuthorized = await validateUser(req);
    if (!isAuthorized) {
        res.status(403).json({
            error: 'No autorizado. Se requieren permisos de administrador.',
        });
        return false;
    }
    return true;
};

const requirePaypalOrder = (
    orderData: Record<string, unknown>,
    res: Response
): boolean => {
    if (!isPaypalManualOrder(orderData)) {
        res.status(400).json({
            error: 'Esta acción solo está disponible para órdenes con método de pago PayPal (paypal_manual)',
            paymentMethod: orderData.paymentMethod ?? 'mercadopago',
        });
        return false;
    }
    return true;
};

export const updatePaypalOrderStatus = async (
    req: AuthenticatedRequest,
    res: Response
) => {
    if (!(await requireAdmin(req, res))) return;

    try {
        const { orderId } = req.params;
        const validationResult = UpdatePaypalOrderStatusSchema.safeParse(req.body);

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

        const orderDoc = await collection.doc(orderId).get();
        if (!orderDoc.exists) {
            return res.status(404).json({ error: 'Orden no encontrada' });
        }

        const orderData = orderDoc.data() as Record<string, unknown>;
        if (!requirePaypalOrder(orderData, res)) return;

        const { status } = validationResult.data;
        const previousStatus = orderData.status;

        await orderDoc.ref.update({
            status,
            statusUpdatedAt: new Date(),
            statusUpdatedBy: req.user.uid,
            updatedAt: new Date(),
        });

        cache.invalidatePattern(`${CACHE_KEYS.ORDERS}:`);

        const updatedDoc = await orderDoc.ref.get();
        const updated = enrichOrderResponse({
            id: updatedDoc.id,
            ...updatedDoc.data(),
        } as Record<string, unknown>);

        return res.json({
            success: true,
            message: 'Estado de la orden actualizado correctamente',
            previousStatus,
            order: updated,
        });
    } catch (error) {
        console.error('updatePaypalOrderStatus error:', error);
        return res.status(500).json({ error: 'Error al actualizar el estado de la orden' });
    }
};

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

export const assignPaypalOrderProducts = async (
    req: AuthenticatedRequest,
    res: Response
) => {
    if (!(await requireAdmin(req, res))) return;

    try {
        const { orderId } = req.params;
        const validationResult = AssignPaypalOrderProductsSchema.safeParse(req.body ?? {});

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

        const { force = false } = validationResult.data;

        const orderDoc = await collection.doc(orderId).get();
        if (!orderDoc.exists) {
            return res.status(404).json({ error: 'Orden no encontrada' });
        }

        const orderData = orderDoc.data() as Record<string, unknown> & {
            userId?: string;
            items?: any[];
            orderNumber?: string;
            discountCode?: string;
            totalPrice?: number;
            originalPrice?: number;
            productsAssignedAt?: unknown;
        };

        if (!requirePaypalOrder(orderData, res)) return;

        if (orderData.productsAssignedAt && !force) {
            return res.status(409).json({
                error: 'Los productos de esta orden ya fueron asignados',
                productsAssignedAt: orderData.productsAssignedAt,
                hint: 'Enviá force: true en el body para volver a ejecutar la asignación',
            });
        }

        const userId = orderData.userId;
        const items = orderData.items;

        if (!userId) {
            return res.status(400).json({ error: 'La orden no tiene usuario asociado' });
        }

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'La orden no tiene productos para asignar' });
        }

        const assignmentResult = await assignProductsToUser(
            userId,
            items,
            `paypal-order-${orderId}`,
            'approved',
            'paypal_manual'
        );

        if (orderData.discountCode) {
            const originalAmount = Number(
                orderData.originalPrice ?? orderData.totalPrice ?? 0
            );
            const discountedAmount = Number(orderData.totalPrice ?? 0);
            await registerDiscountCodeUsage(
                orderData.discountCode,
                userId,
                orderId,
                orderData.orderNumber || orderId,
                originalAmount,
                discountedAmount
            );
        }

        const assignmentRecord = {
            assignedAt: new Date(),
            assignedBy: req.user.uid,
            summary: assignmentResult,
        };

        await orderDoc.ref.update({
            productsAssignedAt: assignmentRecord.assignedAt,
            productsAssignedBy: assignmentRecord.assignedBy,
            productsAssignment: assignmentRecord,
            updatedAt: new Date(),
        });

        cache.invalidatePattern(`${CACHE_KEYS.ORDERS}:`);

        const updatedDoc = await orderDoc.ref.get();
        const updated = enrichOrderResponse({
            id: updatedDoc.id,
            ...updatedDoc.data(),
        } as Record<string, unknown>);

        return res.json({
            success: true,
            message: 'Productos asignados al usuario correctamente',
            assignment: assignmentRecord,
            order: updated,
        });
    } catch (error) {
        console.error('assignPaypalOrderProducts error:', error);
        const message =
            error instanceof Error
                ? error.message
                : 'Error al asignar productos de la orden';
        return res.status(500).json({ error: message });
    }
};