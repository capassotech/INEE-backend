// /src/modules/courses/routes.ts
import { Router } from 'express';
import {
  getAllCourses,
  getCourseById,
  createCourse,
  updateCourse,
  deleteCourse,
} from './controller';
import { authMiddleware } from '../../middleware/authMiddleware';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import { Request, Response } from 'express';

const router = Router();

router.get('/', getAllCourses);
router.get('/:id', getCourseById);
router.post('/', authMiddleware, (req: Request, res: Response) => createCourse(req as AuthenticatedRequest, res));
router.put('/:id', authMiddleware, (req: Request, res: Response) => updateCourse(req as AuthenticatedRequest, res));
router.delete('/:id', authMiddleware, (req: Request, res: Response) => deleteCourse(req as AuthenticatedRequest, res));

export default router;
