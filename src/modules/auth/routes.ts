import { Router } from "express";
import { authMiddleware } from "../../middleware/authMiddleware";
import {
  registerUser,
  loginUser,
  getUserProfile,
  updateUserProfile,
  deleteUser,
} from "./controller";
import {
  validateRegistration,
  validateLogin,
  validateProfileUpdate,
} from "../../middleware/validation";

const router = Router();

// Rutas públicas
router.post("/register", validateRegistration, registerUser);
router.post("/login", validateLogin, loginUser);

// Rutas protegidas
router.get("/me", authMiddleware, (req: Request, res: Response) =>
  getUserProfile(req as AuthenticatedRequest, res)
);
import { Request, Response } from "express";
import { AuthenticatedRequest } from "../../middleware/authMiddleware";

router.put(
  "/me",
  authMiddleware,
  validateProfileUpdate,
  (req: Request, res: Response) =>
    updateUserProfile(req as AuthenticatedRequest, res)
);
router.delete("/me", authMiddleware, (req: Request, res: Response) =>
  deleteUser(req as AuthenticatedRequest, res)
);

export default router;
