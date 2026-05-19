import { Router } from "express";
import { createReminder } from "./controller";

const router = Router();

router.post('/create', createReminder)

export default router;