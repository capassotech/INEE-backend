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

router.patch(
    "/:orderId/status",
    authMiddleware,
    (req: Request, res: Response) =>
        updatePaypalOrderStatus(req as AuthenticatedRequest, res)
)

router.post(
    "/:orderId/asignar-productos",
    authMiddleware,
    (req: Request, res: Response) =>
        assignPaypalOrderProducts(req as AuthenticatedRequest, res)
)

router.get("/:orderId", getOrderById)

export default router;