import { Router } from 'express';
import multer from 'multer';
import { authMiddleware, AuthenticatedRequest } from '../../middleware/authMiddleware';
import { basicSanitization, validateParams } from '../../middleware/zodValidation';
import { CourseImageParamsSchema } from '../../types/course-images';
import { handleGetCourseImages, handleUploadCourseImage } from './controller';
import type { Request, Response } from 'express';

const router = Router();

const defaultMaxSize = 10 * 1024 * 1024; // 10 MB
const configuredMaxSize = Number(process.env.GOOGLE_DRIVE_MAX_IMAGE_SIZE);
const fileSizeLimit = Number.isFinite(configuredMaxSize) && configuredMaxSize > 0
  ? configuredMaxSize
  : defaultMaxSize;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: fileSizeLimit,
  },
});

router.post(
  '/:courseId',
  authMiddleware,
  basicSanitization,
  validateParams(CourseImageParamsSchema),
  upload.single('image'),
  (req: Request, res: Response) =>
    handleUploadCourseImage(req as AuthenticatedRequest, res)
);

router.get(
  '/:courseId',
  validateParams(CourseImageParamsSchema),
  handleGetCourseImages
);

export default router;
