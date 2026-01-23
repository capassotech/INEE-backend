import { Router } from "express";
import { createPayment, handleWebhook, createPreference } from "./controller";

const router = Router();

router.post("/mercadopago/create-payment", createPayment);
import { handleWebhook, createPreference } from "./controller";

const router = Router();

router.post("/mercadopago/create-preference", createPreference);

router.post("/mercadopago/webhook", handleWebhook);

// Implementacion de Checkout API oculta

// router.post("/mercadopago/create-payment", createPayment);


export default router;