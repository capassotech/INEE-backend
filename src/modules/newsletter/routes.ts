import { Router } from "express";
import rateLimit from "express-rate-limit";
import { verifyRecaptcha } from "../../middleware/recaptcha";
import { subscribeNewsletter, getSuscribeUsers } from "./controller";

const router = Router();

const newsletterLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { message: "Demasiados intentos. Por favor esperá 15 minutos antes de volver a intentarlo." },
  standardHeaders: true,
  legacyHeaders: false,
});

router.get("/", getSuscribeUsers);

router.post("/", newsletterLimiter, verifyRecaptcha, subscribeNewsletter);

export default router;