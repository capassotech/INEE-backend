import { Router, Request, Response } from "express";
import { authMiddleware, AuthenticatedRequest } from "../../middleware/authMiddleware";
import {
    getOrders,
    getOrderById,
    createPaypalOrder,
    submitPaypalProof,
} from "./controller";
import { paypalProofUpload } from "./paypalProofUpload";


const router = Router();

const submitPaypalProofHandlers = [
    authMiddleware,
    paypalProofUpload,
    (req: Request, res: Response) => submitPaypalProof(req as AuthenticatedRequest, res),
];

router.get("/", getOrders)

// Alias en español (frontend) + ruta en inglés
router.post("/paypal/comprobante", ...submitPaypalProofHandlers)
router.post("/paypal/proof", ...submitPaypalProofHandlers)

router.post("/paypal", createPaypalOrder)

router.get("/:orderId", getOrderById)

export default router;