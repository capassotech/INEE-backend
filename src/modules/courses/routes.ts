// /src/modules/courses/routes.ts
import { Router } from 'express';
import {
  getAllCourses,
  getCourseById,
  createCourse,
  updateCourse,
  deleteCourse,
  getUserCourses,
  checkCourseExists,
} from './controller';
import { authMiddleware } from '../../middleware/authMiddleware';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import { validateBody, validateMultiple, basicSanitization } from "../../middleware/zodValidation";
import { CourseSchema, UpdateCourseSchema } from "../../types/courses";
import { Request, Response } from 'express';

const router = Router();

router.get('/', getAllCourses);
router.get('/check/:id', checkCourseExists);
router.get('/:id', getCourseById);
router.get('/user/:id', getUserCourses);

router.post('/', 
    authMiddleware,
    basicSanitization,
    validateBody(CourseSchema),
    (req: Request, res: Response) => createCourse(req as AuthenticatedRequest, res)
);

router.put('/:id', 
    authMiddleware,
    basicSanitization,
    validateMultiple({
        body: UpdateCourseSchema
    }),
    (req: Request, res: Response) => updateCourse(req as AuthenticatedRequest, res)
);

router.delete('/:id', 
    authMiddleware,
    (req: Request, res: Response) => deleteCourse(req as AuthenticatedRequest, res)
);

export default router;
