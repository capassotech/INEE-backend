import { Router, Request, Response } from "express";
import { authMiddleware, AuthenticatedRequest } from "../../middleware/authMiddleware";
import {
    getOrders,
    getOrderById,
    createPaypalOrder,
    updatePaypalOrderStatus,
    assignPaypalOrderProducts,
} from "./controller";


const router = Router();

router.get("/", getOrders)

router.post("/paypal", createPaypalOrder)

const updateStatusHandlers = [
    authMiddleware,
    (req: Request, res: Response) =>
        updatePaypalOrderStatus(req as AuthenticatedRequest, res),
];

const assignProductsHandlers = [
    authMiddleware,
    (req: Request, res: Response) =>
        assignPaypalOrderProducts(req as AuthenticatedRequest, res),
];

router.patch("/:orderId/status", ...updateStatusHandlers)

router.post("/:orderId/assign-products", ...assignProductsHandlers)
router.post("/:orderId/asignar-productos", ...assignProductsHandlers)

router.get("/:orderId", getOrderById)

export default router;