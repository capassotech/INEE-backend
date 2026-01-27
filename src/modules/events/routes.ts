import { Router } from "express";
import {
  createEvent,
  updateEvent,
  deleteEvent,
  getAllEvents,
  getEventById,
  getEventInscripciones,
  getUserEvents,
} from "./controller";
import {
  AuthenticatedRequest,
  authMiddleware,
} from "../../middleware/authMiddleware";
import { Request, Response } from "express";
import {
  basicSanitization,
  validateBody,
} from "../../middleware/zodValidation";
import { EventCreateSchema, EventUpdateSchema } from "../../types/events";
import { comprarEInscribirse } from "../event-registrations/controller";
const router = Router();
router.get("/", getAllEvents);
router.get("/user/:id", getUserEvents);
router.get(
  "/:eventId/inscripciones",
  authMiddleware,
  (req: Request, res: Response) =>
    getEventInscripciones(req as AuthenticatedRequest, res)
);
router.get("/:id", getEventById);
router.post(
  "/",
  authMiddleware,
  basicSanitization,
  validateBody(EventCreateSchema),
  (req: Request, res: Response) => createEvent(req as AuthenticatedRequest, res)
);
router.put(
  "/:id",
  authMiddleware,
  basicSanitization,
  validateBody(EventUpdateSchema),
  (req: Request, res: Response) => updateEvent(req as AuthenticatedRequest, res)
);
router.delete("/:id", authMiddleware, (req: Request, res: Response) =>
  deleteEvent(req as AuthenticatedRequest, res)
);

// Endpoint para inscribirse a un evento después del pago (compatibilidad con frontend)
// POST /api/eventos/:eventoId/inscribir
router.post(
  "/:eventoId/inscribir",
  authMiddleware,
  (req: Request, res: Response) => {
    // Adaptar el request para que comprarEInscribirse pueda usarlo
    // El eventoId viene en los params, pero comprarEInscribirse lo espera en el body
    const eventoId = req.params.eventoId;
    req.body.eventoId = eventoId;
    comprarEInscribirse(req as AuthenticatedRequest, res);
  }
);

export default router;
