import { Router } from "express";
import { subscribeNewsletter, getSuscribeUsers } from "./controller";


const router = Router();

router.get("/", getSuscribeUsers)

router.post("/", subscribeNewsletter)

export default router;