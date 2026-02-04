import { Router } from "express";
import { handleWebhook, createPreference } from "./controller";

const router = Router();

// createPayment está comentado en el controller (implementación vieja de Checkout API)
// router.post("/mercadopago/create-payment", createPayment);
router.post("/mercadopago/create-preference", createPreference);
router.post("/mercadopago/webhook", handleWebhook);

export default router;