import { Router } from "express";
import { 
    getAllCarts, 
    createCart, 
    addItemToCart, 
    updateQuantity, 
    deleteItemFromCart, 
    assignUserToCart, 
    mergeCarts,
} from "./controller";

const router = Router();

router.get('/', getAllCarts);
router.post('/', createCart);
router.post('/:cartId/add-item', addItemToCart);
router.put('/:cartId/update-quantity', updateQuantity)
router.delete('/:cartId/delete-item', deleteItemFromCart)
router.put('/:cartId/assign-user', assignUserToCart)
router.post('/:cartId/merge', mergeCarts)

export default router;

