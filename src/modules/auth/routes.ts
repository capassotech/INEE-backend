import { Router, Request, Response } from "express";
import {
  authMiddleware,
  AuthenticatedRequest,
} from "../../middleware/authMiddleware";
import {
  registerUser,
  loginUser,
  getUserProfile,
  updateUserProfile,
  deleteUser,
  refreshToken,
  updateUserAdditionalData,
  checkEmailExists,
  googleAuth,
  getUserById,
  getUserByEmail,
  validateToken,
  linkPasswordProvider,
  linkGoogleProvider,   
  updateUserDni,       
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

router.post("/google", googleAuth); 

router.post("/link-password", linkPasswordProvider); 

router.post("/link-google", linkGoogleProvider);     

router.post("/validate-token", sanitizeInput, validateToken);

router.get("/user/:uid", getUserById);

router.get("/check-email/:email", getUserByEmail);

router.get("/login-stats", (req: Request, res: Response) => {
  res.json(getLoginStats());
});

router.post("/check-email", sanitizeInput, checkEmailExists);

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

router.put("/additional-data", authMiddleware, (req: Request, res: Response) =>
  updateUserAdditionalData(req as AuthenticatedRequest, res)
);

router.patch("/update-dni", authMiddleware, (req: Request, res: Response) =>  
  updateUserDni(req as AuthenticatedRequest, res)
);

router.delete("/me", authMiddleware, (req: Request, res: Response) =>
  deleteUser(req as AuthenticatedRequest, res)
);

router.post("/refresh-token", authMiddleware, (req: Request, res: Response) =>
  refreshToken(req as AuthenticatedRequest, res)
);

export default router;