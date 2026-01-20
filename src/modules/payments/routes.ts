import { Router } from "express";
import { handleWebhook, createPreference } from "./controller";

const router = Router();

// Checkout PRO (preferencias y redirección a Mercado Pago)
router.post("/mercadopago/create-preference", createPreference);

// Webhook para Checkout PRO
router.post("/mercadopago/webhook", handleWebhook);

export default router;