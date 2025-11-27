import { Router } from "express";
import { 
    getAllCarts, 
    createCart, 
    addItemToCart, 
    deleteItemFromCart, 
    assignUserToCart, 
    mergeCarts,
    getCartByUserId,
    getCartById,
    createCartWhithoutUser,
    clearCart
} from "./controller";

const router = Router();

router.get('/', getAllCarts);
router.get('/get-cart-by-id/:cartId', getCartById);
router.get('/get-cart-by-userid/:userId', getCartByUserId);
router.post('/create-cart/:userId', createCart);
router.post('/', createCartWhithoutUser);
router.post('/add-item/:cartId', addItemToCart);
router.delete('/delete-item/:cartId', deleteItemFromCart)
router.put('/assign-user/:cartId', assignUserToCart)
router.post('/merge/:userId', mergeCarts)
router.delete('/clear-cart/:cartId', clearCart)

export default router;

