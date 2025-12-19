
import { Router } from "express";
import { sendEmail } from "./controller";

const router = Router();

router.post('/send-email', sendEmail);

export default router;