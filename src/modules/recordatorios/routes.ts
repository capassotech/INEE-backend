import { Router, type Request, type Response } from "express";
import { createReminder } from "./controller";
import { runAbandonedCartReminders } from "./abandonedCartScheduler";

const router = Router();

router.post('/create', createReminder)

/**
 * Dispara la revisión de carritos abandonados (para un cron externo, por si el servidor se duerme).
 * Requiere el header x-cron-secret igual a CRON_SECRET. Con ?dryRun=true solo cuenta, sin enviar.
 */
router.post('/abandoned-carts/run', async (req: Request, res: Response) => {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.header('x-cron-secret') !== secret) {
        return res.status(401).json({ error: 'No autorizado' });
    }
    try {
        const result = await runAbandonedCartReminders({ dryRun: req.query.dryRun === 'true' });
        return res.json(result);
    } catch (error) {
        console.error('[Carrito abandonado] Error al ejecutar desde el endpoint:', error);
        return res.status(500).json({ error: 'Error al revisar carritos abandonados' });
    }
});

export default router;