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

const router = Router();

router.get('/', getAllCourses);
router.get('/:id', getCourseById);
// router.post('/', authMiddleware, createCourse);
// router.put('/:id', authMiddleware, updateCourse);
// router.delete('/:id', authMiddleware, deleteCourse);

export default router;
