import { Router, Request, Response } from "express";
import {
  authMiddleware,
  AuthenticatedRequest,
} from "../../middleware/authMiddleware";
import {
  registerUser,
  loginUser,
  loginUserSecure, // Versión con verificación de contraseña
  getUserProfile,
  updateUserProfile,
  deleteUser,
  refreshToken,
} from "./controller";
import {
  validateRegistration,
  validateLogin,
  validateProfileUpdate,
  trackLoginResult,
  sanitizeInput,
  getLoginStats,
} from "../../middleware/validation";

const router = Router();

router.post("/register", sanitizeInput, validateRegistration, registerUser);

router.post(
  "/login",
  sanitizeInput,
  validateLogin,
  trackLoginResult,
  loginUser
);

router.get("/login-stats", (req: Request, res: Response) => {
  // En producción, agregar middleware de admin aquí
  res.json(getLoginStats());
});

// ============= RUTAS PROTEGIDAS =============
router.get("/me", authMiddleware, (req: Request, res: Response) =>
  getUserProfile(req as AuthenticatedRequest, res)
);

router.put(
  "/me",
  authMiddleware,
  sanitizeInput,
  validateProfileUpdate,
  (req: Request, res: Response) =>
    updateUserProfile(req as AuthenticatedRequest, res)
);

router.delete("/me", authMiddleware, (req: Request, res: Response) =>
  deleteUser(req as AuthenticatedRequest, res)
);

router.post("/refresh-token", authMiddleware, (req: Request, res: Response) =>
  refreshToken(req as AuthenticatedRequest, res)
);

export default router;
