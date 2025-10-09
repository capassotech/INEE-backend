import { Router } from "express";
import { createEbook, deleteEbook, getEbooks, getEbookById, updateEbook } from "./controller";
import { authMiddleware } from "../../middleware/authMiddleware";
import { basicSanitization } from "../../middleware/zodValidation";
import { validateBody } from "../../middleware/zodValidation";
import { EbookCreateSchema } from "../../types/ebooks";
import { AuthenticatedRequest } from "../../middleware/authMiddleware";
import { Request, Response } from "express";


const router = Router();

router.get('/', getEbooks);

router.get('/:id', getEbookById);

router.post('/', 
    authMiddleware,
    basicSanitization,
    validateBody(EbookCreateSchema),
    (req: Request, res: Response) => createEbook(req as AuthenticatedRequest, res)
);

router.put('/:id', 
    authMiddleware,
    basicSanitization,
    validateBody(EbookCreateSchema),
    (req: Request, res: Response) => updateEbook(req as AuthenticatedRequest, res)
);

router.delete('/:id', 
    authMiddleware,
    (req: Request, res: Response) => deleteEbook(req as AuthenticatedRequest, res)
); 

export default router;