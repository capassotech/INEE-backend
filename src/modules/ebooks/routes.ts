import { Router } from "express";
import {
  createEbook,
  updateEbook,
  deleteEbook,
  getAllEbooks,
  getEbookById,
  getUserEbooks,
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
import { EbookCreateSchema, EbookUpdateSchema } from "../../types/ebooks";

const router = Router();

router.get("/", getAllEbooks);
router.get("/:id", getEbookById);
router.get("/user/:id", getUserEbooks);

router.post(
  "/",
  authMiddleware,
  basicSanitization,
  validateBody(EbookCreateSchema),
  (req: Request, res: Response) => createEbook(req as AuthenticatedRequest, res)
);

router.put(
  "/:id",
  authMiddleware,
  basicSanitization,
  validateBody(EbookUpdateSchema),
  (req: Request, res: Response) => updateEbook(req as AuthenticatedRequest, res)
);

router.delete("/:id", authMiddleware, (req: Request, res: Response) =>
  deleteEbook(req as AuthenticatedRequest, res)
);

export default router;
