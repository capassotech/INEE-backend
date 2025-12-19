import { Router } from "express";
import { getOrders, getOrderById } from "./controller";


const router = Router();

router.get("/", getOrders)

router.get("/:orderId", getOrderById)

export default router;