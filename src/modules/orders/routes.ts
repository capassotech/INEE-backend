import { Router, Request, Response } from "express";
import { authMiddleware, AuthenticatedRequest } from "../../middleware/authMiddleware";
import {
    getOrders,
    getOrdersCount,
    getOrderById,
    createPaypalOrder,
    submitPaypalProof,
    updatePaypalOrderStatus,
    assignPaypalOrderProducts,
} from "./controller";
import { paypalProofUpload } from "./paypalProofUpload";


const router = Router();

const submitPaypalProofHandlers = [
    authMiddleware,
    paypalProofUpload,
    (req: Request, res: Response) => submitPaypalProof(req as AuthenticatedRequest, res),
];

router.get("/count", authMiddleware, getOrdersCount)
router.get("/", getOrders)

// Alias en español (frontend) + ruta en inglés
router.post("/paypal/comprobante", ...submitPaypalProofHandlers)
router.post("/paypal/proof", ...submitPaypalProofHandlers)

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