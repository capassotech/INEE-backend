import { firestore } from "../../config/firebase";
import { Request, Response } from "express";

export const getAllCarts = async (_: Request, res: Response) => {
    try {
        const cartItems = await firestore.collection('carts').get();
        return res.json(cartItems.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    } catch (error) {
        console.error('Error al obtener todos los carritos:', error);
        return res.status(500).json({ error: 'Error al obtener todos los carritos' });
    }
}   

export const getCartById = async (req: Request, res: Response) => {
    try {
        const { cartId } = req.params;
        const cart = await firestore.collection('carts').doc(cartId).get();
        if (!cart.exists) {
            return res.status(200).json({ error: 'Carrito no encontrado' });
        }
        return res.json({ id: cart.id, ...cart.data() });
    } catch (error) {
        console.error('Error al obtener carrito por id:', error);
        return res.status(500).json({ error: 'Error al obtener carrito por id' });
    }
}

export const getCartByUserId = async (req: Request, res: Response) => {
    try {
        const { userId } = req.params;
        const cart = await firestore.collection('carts').where('userId', '==', userId).get();
        if (cart.empty) {
            return res.status(200).json({ error: 'Carrito no encontrado' });
        }
        return res.json(cart.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    } catch (error) {
        console.error('Error al obtener carrito por usuario:', error);
        return res.status(500).json({ error: 'Error al obtener carrito por usuario' });
    }
}

export const createCart = async (req: Request, res: Response) => {
    const { items } = req.body;
    const { userId } = req.params;

    const existingCart = await firestore.collection('carts').where('userId', '==', userId).get();
    if (!existingCart.empty) {
        return res.status(400).json({ error: 'Carrito ya existe' });
    }

    for (const item of items) {
        const product = await firestore.collection('courses').doc(item.productId).get();
        if (!product.exists) {
            return res.status(404).json({ error: 'Curso no encontrado' });
        }
    }

    try {
        const cart = await firestore.collection('carts').add({
            userId,
            items,
            createdAt: new Date(),
        });
        const cartSnapshot = await cart.get();
        return res.json({ id: cartSnapshot.id, ...cartSnapshot.data() });     
    } catch (error) {
        console.error('Error al crear carrito:', error);
        return res.status(500).json({ error: 'Error al crear carrito' });
    }   
}

export const createCartWhithoutUser = async (req: Request, res: Response) => {
    const { items } = req.body;
    try {
        const cart = await firestore.collection('carts').add({
            items,
            createdAt: new Date(),
        });
        const cartSnapshot = await cart.get();
        return res.json({ id: cartSnapshot.id, ...cartSnapshot.data() });     
    } catch (error) {
        console.error('Error al crear carrito sin usuario:', error);
        return res.status(500).json({ error: 'Error al crear carrito sin usuario' });
    }
}

export const addItemToCart = async (req: Request, res: Response) => {
    const { cartId } = req.params;
    const { item } = req.body;
    const cartSnapshot = await firestore.collection('carts').doc(cartId).get();
    if (!cartSnapshot.exists) {
        return res.status(404).json({ error: 'Carrito no encontrado' });
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
        console.error('Error al agregar item al carrito:', error);
        return res.status(500).json({ error: 'Error al agregar item al carrito' });
    }

}

export const updateQuantity = async (req: Request, res: Response) => {
    const { cartId } = req.params;
    const { productId, quantity } = req.body;
    const cart = await firestore.collection('carts').doc(cartId).get();
    if (!cart) {
        return res.status(404).json({ error: 'Carrito no encontrado' });
    }
    const itemIndex = cart.data()?.items.find((item: any) => item.productId === productId);
    if (!itemIndex) {
        return res.status(404).json({ error: 'Item no encontrado' });
    }

    try {
        await firestore.collection('carts').doc(cartId).update({
            items: cart.data()?.items.map((item: any) => item.productId === productId ? { ...item, quantity } : item),
            updatedAt: new Date(),
        });
        return res.json(cart.data());
    } catch (error) {
        console.error('Error al actualizar cantidad:', error);
        return res.status(500).json({ error: 'Error al actualizar cantidad' });
    }
}

export const deleteItemFromCart = async (req: Request, res: Response) => {
    const { cartId } = req.params;
    const { productId } = req.body;
    const cart = await firestore.collection('carts').doc(cartId).get();
    if (!cart.exists) {
        return res.status(404).json({ error: 'Carrito no encontrado' });
    }

    try {
        await firestore.collection('carts').doc(cartId).update({
            items: cart.data()?.items.filter((item: any) => item.productId !== productId),
            updatedAt: new Date(),
        });
        return res.json(cart.data());    
    } catch (error) {
        console.error('Error al eliminar item del carrito:', error);
        return res.status(500).json({ error: 'Error al eliminar item del carrito' });
    }
}

export const assignUserToCart = async (req: Request, res: Response) => {
    const { cartId } = req.params;
    const { userId } = req.body;
    const cart = await firestore.collection('carts').doc(cartId).get();
    if (!cart.exists) {
        return res.status(404).json({ error: 'Carrito no encontrado' });
    }
    const user = await firestore.collection('users').doc(userId).get();
    if (!user.exists) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    try {
        await firestore.collection('carts').doc(cartId).update({
            userId,
            updatedAt: new Date(),
        });
        return res.json(cart.data());
    } catch (error) {
        console.error('Error al asignar usuario al carrito:', error);
        return res.status(500).json({ error: 'Error asignando usuario al carrito' });
    }
}

export const mergeCarts = async (req: Request, res: Response) => {
    const { cartId } = req.params;
    const { localCart } = req.body;
    const cart = await firestore.collection('carts').doc(cartId).get();
    if (!cart.exists) {
        return res.status(404).json({ error: 'Carrito no encontrado' });
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
        console.error('Error al mergear carritos:', error);
        return res.status(500).json({ error: 'Error al mergear carritos' });
    }
}   