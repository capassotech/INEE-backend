import { Router } from "express";
import { createPayment, handleWebhook } from "./controller";

const router = Router();

router.post("/mercadopago/create-payment", createPayment);

router.post("/mercadopago/webhook", handleWebhook);

export default router;