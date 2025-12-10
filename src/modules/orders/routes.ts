import { Router } from "express";
import { getOrders, getOrderById } from "./controller";


const router = Router();

router.get("/order", getOrders)

router.get("/order/:orderId", getOrderById)

export default router;