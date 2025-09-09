import { Router } from "express";
import { createEvent, updateEvent, deleteEvent, getAllEvents, getEventById } from "./controller";
import { AuthenticatedRequest, authMiddleware } from "../../middleware/authMiddleware";
import { Request, Response } from "express";

const router = Router();

router.get('/', getAllEvents);
router.get('/:id', getEventById);
router.post('/', authMiddleware, (req: Request, res: Response) => createEvent(req as AuthenticatedRequest, res));
router.put('/:id', authMiddleware, (req: Request, res: Response) => updateEvent(req as AuthenticatedRequest, res));
router.delete('/:id', authMiddleware, (req: Request, res: Response) => deleteEvent(req as AuthenticatedRequest, res));

export default router;