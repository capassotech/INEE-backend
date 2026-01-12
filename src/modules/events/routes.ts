import { Router } from "express";
import { createEvent, updateEvent, deleteEvent, getAllEvents, getEventById, getEventInscripciones } from "./controller";
import { AuthenticatedRequest, authMiddleware } from "../../middleware/authMiddleware";
import { Request, Response } from "express";
import { basicSanitization, validateBody } from "../../middleware/zodValidation";
import { EventCreateSchema, EventUpdateSchema } from "../../types/events";

const router = Router();

router.get('/', getAllEvents);
router.get('/:eventId/inscripciones', authMiddleware, (req: Request, res: Response) => getEventInscripciones(req as AuthenticatedRequest, res));
router.get('/:id', getEventById);
router.post('/', authMiddleware, basicSanitization, validateBody(EventCreateSchema), (req: Request, res: Response) => createEvent(req as AuthenticatedRequest, res));
router.put('/:id', authMiddleware, basicSanitization, validateBody(EventUpdateSchema), (req: Request, res: Response) => updateEvent(req as AuthenticatedRequest, res));
router.delete('/:id', authMiddleware, (req: Request, res: Response) => deleteEvent(req as AuthenticatedRequest, res));

export default router;