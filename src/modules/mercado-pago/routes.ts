// /src/modules/mercado-pago/routes.ts
import { Router } from 'express';
import { createPreference, handleWebhook } from './controller';

const router = Router();

router.post('/create-preference', createPreference);
router.post('/webhook', handleWebhook);

export default router;