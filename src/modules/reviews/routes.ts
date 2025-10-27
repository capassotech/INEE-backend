import { Router } from "express";
import { createReview, getReviewsByCourse } from "../reviews/controller";
import { authMiddleware } from "../../middleware/authMiddleware";
import { validateBody } from "../../middleware/zodValidation";
import { ReviewCreateSchema } from "../../types/reviews";
import { AuthenticatedRequest } from "../../middleware/authMiddleware";
import { Request, Response } from "express";

const router = Router();

router.get("/course/:courseId", getReviewsByCourse);

router.post(
  "/",
  authMiddleware,
  validateBody(ReviewCreateSchema),
  (req: Request, res: Response) => createReview(req as AuthenticatedRequest, res)
);

export default router;