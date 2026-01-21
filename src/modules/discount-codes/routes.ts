import { Router } from "express";
import { Request, Response } from "express";
import {
  getAllDiscountCodes,
  createDiscountCode,
  updateDiscountCode,
  deleteDiscountCode,
  validateDiscountCode,
} from "./controller";
import {
  authMiddleware,
  AuthenticatedRequest,
} from "../../middleware/authMiddleware";
import {
  basicSanitization,
  validateBody,
} from "../../middleware/zodValidation";
import {
  DiscountCodeCreateSchema,
  DiscountCodeUpdateSchema,
} from "../../types/discount-codes";

const router = Router();

router.get("/", getAllDiscountCodes);
router.get("/validate", validateDiscountCode);

router.post(
  "/",
  authMiddleware,
  basicSanitization,
  validateBody(DiscountCodeCreateSchema),
  (req: Request, res: Response) =>
    createDiscountCode(req as AuthenticatedRequest, res)
);

router.put(
  "/:id",
  authMiddleware,
  basicSanitization,
  validateBody(DiscountCodeUpdateSchema),
  (req: Request, res: Response) =>
    updateDiscountCode(req as AuthenticatedRequest, res)
);

router.delete(
  "/:id",
  authMiddleware,
  (req: Request, res: Response) =>
    deleteDiscountCode(req as AuthenticatedRequest, res)
);

export default router;

