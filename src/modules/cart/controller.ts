import { firestore } from "../../config/firebase";
import { Request, Response } from "express";

export const getAllCarts = async (_: Request, res: Response) => {
    try {
        const cartItems = await firestore.collection('carts').get();
        return res.json(cartItems.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    } catch (error) {
        console.error('Error getting all carts:', error);
        return res.status(500).json({ error: 'Error getting all carts' });
    }
}   

export const createCart = async (req: Request, res: Response) => {
    const { userId, items } = req.body;

    const existingCart = await firestore.collection('carts').where('userId', '==', userId).get();
    if (!existingCart.empty) {
        return res.status(400).json({ error: 'Cart already exists' });
    }

    try {
        const cart = await firestore.collection('carts').add({
            userId,
            items,
            createdAt: new Date(),
        });
        return res.json(cart);    
    } catch (error) {
        console.error('Error creating cart:', error);
        return res.status(500).json({ error: 'Error creating cart' });
    }
}

export const addItemToCart = async (req: Request, res: Response) => {
    const { cartId } = req.params;
    const { item } = req.body;
    const cartSnapshot = await firestore.collection('carts').doc(cartId).get();
    if (!cartSnapshot.exists) {
        return res.status(404).json({ error: 'Cart not found' });
    }

    const existingItems = cartSnapshot.data()?.items || [];
    const itemWithAddedAt = { ...item, addedAt: new Date() };

    try {
        await firestore.collection('carts').doc(cartId).update({
            items: [...existingItems, itemWithAddedAt],
            updatedAt: new Date(),
        });
    
        const updatedCartSnapshot = await firestore.collection('carts').doc(cartId).get();
        return res.json(updatedCartSnapshot.data());
    } catch (error) {
        console.error('Error adding item to cart:', error);
        return res.status(500).json({ error: 'Error adding item to cart' });
    }

}

export const updateQuantity = async (req: Request, res: Response) => {
    const { cartId } = req.params;
    const { productId, quantity } = req.body;
    const cart = await firestore.collection('carts').doc(cartId).get();
    if (!cart) {
        return res.status(404).json({ error: 'Cart not found' });
    }
    const itemIndex = cart.data()?.items.find((item: any) => item.productId === productId);
    if (!itemIndex) {
        return res.status(404).json({ error: 'Item not found' });
    }

    try {
        await firestore.collection('carts').doc(cartId).update({
            items: cart.data()?.items.map((item: any) => item.productId === productId ? { ...item, quantity } : item),
            updatedAt: new Date(),
        });
        return res.json(cart.data());
    } catch (error) {
        console.error('Error updating quantity:', error);
        return res.status(500).json({ error: 'Error updating quantity' });
    }
}

export const deleteItemFromCart = async (req: Request, res: Response) => {
    const { cartId } = req.params;
    const { productId } = req.body;
    const cart = await firestore.collection('carts').doc(cartId).get();
    if (!cart.exists) {
        return res.status(404).json({ error: 'Cart not found' });
    }

    try {
        await firestore.collection('carts').doc(cartId).update({
            items: cart.data()?.items.filter((item: any) => item.productId !== productId),
            updatedAt: new Date(),
        });
        return res.json(cart.data());    
    } catch (error) {
        console.error('Error deleting item from cart:', error);
        return res.status(500).json({ error: 'Error deleting item from cart' });
    }
}

export const assignUserToCart = async (req: Request, res: Response) => {
    const { cartId } = req.params;
    const { userId } = req.body;
    const cart = await firestore.collection('carts').doc(cartId).get();
    if (!cart.exists) {
        return res.status(404).json({ error: 'Cart not found' });
    }
    const user = await firestore.collection('users').doc(userId).get();
    if (!user.exists) {
        return res.status(404).json({ error: 'User not found' });
    }

    try {
        await firestore.collection('carts').doc(cartId).update({
            userId,
            updatedAt: new Date(),
        });
        return res.json(cart.data());
    } catch (error) {
        console.error('Error assigning user to cart:', error);
        return res.status(500).json({ error: 'Error asignando usuario al carrito' });
    }
}

export const mergeCarts = async (req: Request, res: Response) => {
    const { cartId } = req.params;
    const { localCart } = req.body;
    const cart = await firestore.collection('carts').doc(cartId).get();
    if (!cart.exists) {
        return res.status(404).json({ error: 'Cart not found' });
    }

    const cartItems = cart.data()?.items;

    let i = 0
    const newCart = []
    while (i < localCart.length) {
        const localItem = localCart[i];
        const cartItem = cartItems.find((item: any) => item.productId === localItem.productId);
        if (cartItem) {
            newCart.push({
                ...cartItem,
                quantity: cartItem.quantity + localItem.quantity,
            });
        } else {
            newCart.push(localItem);
        }
        i++;
    }

    try {
        await firestore.collection('carts').doc(cartId).update({
            items: newCart,
            updatedAt: new Date(),
        });
    
        return res.json(cart.data());
    } catch (error) {
        console.error('Error merging carts:', error);
        return res.status(500).json({ error: 'Error al mergear carritos' });
    }
}   