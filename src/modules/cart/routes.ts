import { Router } from "express";
import { 
    getAllCarts, 
    createCart, 
    addItemToCart, 
    updateQuantity, 
    deleteItemFromCart, 
    assignUserToCart, 
    mergeCarts,
    getCartByUserId,
    getCartById,
    createCartWhithoutUser
} from "./controller";

const router = Router();

router.get('/', getAllCarts);
router.get('/:cartId/get-cart-by-id', getCartById);
router.get('/:userId', getCartByUserId);
router.post('/:userId', createCart);
router.post('/', createCartWhithoutUser);
router.post('/:cartId/add-item', addItemToCart);
router.put('/:cartId/update-quantity', updateQuantity)
router.delete('/:cartId/delete-item', deleteItemFromCart)
router.put('/:cartId/assign-user', assignUserToCart)
router.post('/:cartId/merge', mergeCarts)

export default router;

