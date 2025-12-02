import { Request, Response } from "express";
import { firestore } from '../../config/firebase';


export const createOrder = async (userId: string, items: any[], totalPrice: number, status: string) => {
    const order = await firestore.collection('orders').add({
        userId,
        items,
        totalPrice,
        createdAt: new Date(),
        status
    });
    return order.id;
}

export const updateOrderStatus = async (orderId: string, status: string) => {
    const order = await firestore.collection('orders').doc(orderId).update({ status });
    return order;
}

export const updatePreferenceId = async (orderId: string, preferenceId: string) => {
    const order = await firestore.collection('orders').doc(orderId).update({ preferenceId });
    return order;
}

export const getOrders = async (req: Request, res: Response) => {
    const orders = await firestore.collection('orders').get();
    return res.json(orders.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
}

export const getOrderById = async (req: Request, res: Response) => {
    const { orderId } = req.params;
    const order = await firestore.collection('orders').doc(orderId).get();
    return res.json(order.data());
}