import { Request, Response } from "express";
import { firestore } from '../../config/firebase';

// Metodos necesarios
export const createOrder = async (userId: string, items: any[], totalPrice: number, status: string) => {
    // Generar número de orden legible: ORD-YYYY-NNNNNN
    const year = new Date().getFullYear();
    const orderNumber = `ORD-${year}-${Date.now().toString().slice(-6)}`;
    
    const order = await firestore.collection('orders').add({
        userId,
        items,
        totalPrice,
        createdAt: new Date(),
        status,
        orderNumber
    });
    return { orderId: order.id, orderNumber };
}

export const updateOrderStatus = async (orderId: string, status: string) => {
    const order = await firestore.collection('orders').doc(orderId).update({ status });
    return order;
}

export const updatePreferenceId = async (orderId: string, preferenceId: string) => {
    const order = await firestore.collection('orders').doc(orderId).update({ preferenceId });
    return order;
}


// Esto viene de las rutas
export const getOrders = async (req: Request, res: Response) => {
    const snapshot = await firestore
        .collection('orders')
        .orderBy('createdAt', 'desc')
        .get();

    return res.json(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
}

export const getOrderById = async (req: Request, res: Response) => {
    const { orderId } = req.params;
    const order = await firestore.collection('orders').doc(orderId).get();
    return res.json(order.data());
}