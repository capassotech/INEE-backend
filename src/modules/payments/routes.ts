import { Router } from "express";
import { createPayment, handleWebhook, createPreference } from "./controller";

const router = Router();

router.post("/mercadopago/create-payment", createPayment);
router.post("/mercadopago/create-preference", createPreference);
router.post("/mercadopago/webhook", handleWebhook);

export default router;