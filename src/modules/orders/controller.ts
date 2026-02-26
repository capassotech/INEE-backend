import { Request, Response } from "express";
import { firestore } from '../../config/firebase';
import { normalizeText } from "../../utils/utils";
import { cache, CACHE_KEYS } from "../../utils/cache";

const collection = firestore.collection('orders');

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
        
        const response = {
            orders,
            pagination: {
                hasMore,
                lastId: lastDoc?.id,
                limit,
                count: orders.length,
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
        
        return res.json({ id: order.id, ...order.data() });
    } catch (error) {
        console.error('getOrderById error:', error);
        return res.status(500).json({ error: 'Error al obtener orden' });
    }
}