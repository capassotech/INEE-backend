import { Router } from "express";
import { createPayment, handleWebhook, createPreference } from "./controller";

const router = Router();

// Checkout API con tarjeta en sitio
router.post("/mercadopago/create-payment", createPayment);

// Checkout PRO (preferencias y redirección a Mercado Pago)
router.post("/mercadopago/create-preference", createPreference);

// Webhook común para ambos flujos
router.post("/mercadopago/webhook", handleWebhook);

export default router;