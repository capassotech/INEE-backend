import { Router } from "express";
import { contactSend } from "./controller";

const router = Router();

router.post("/", contactSend)

export default router;
