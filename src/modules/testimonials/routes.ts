import { Router } from "express";
import { getTestimonials } from "./controller";


const router = Router();

router.get('/', getTestimonials);

export default router;