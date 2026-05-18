import { Router } from "express";
import { getOrders, getOrderById, createPaypalOrder } from "./controller";


const router = Router();

router.get("/", getOrders)

router.get("/:orderId", getOrderById)

router.post("/paypal", createPaypalOrder)

export default router;