import { Router, type Request, type Response, type RequestHandler } from 'express';
import multer from 'multer';
import { authMiddleware, AuthenticatedRequest } from '../../middleware/authMiddleware';
import { basicSanitization, validateParams } from '../../middleware/zodValidation';
import { CourseImageParamsSchema } from '../../types/course-images';
import { handleGetCourseImages, handleUploadCourseImage } from './controller';

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

const singleImageUpload: RequestHandler = (req, res, next) => {
  upload.single('image')(req, res, (error: any) => {
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          error: 'La imagen supera el tamaño máximo permitido.',
        });
      }

      if (error.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({
          error: 'Solo se permite subir un archivo de imagen por solicitud.',
        });
      }

      return res.status(400).json({
        error: "No se pudo procesar la imagen. Asegúrate de enviarla en el campo 'image'.",
      });
    }

    if (error) {
      console.error('Error al procesar la imagen antes de la subida:', error);
      return res.status(500).json({
        error: 'Error interno del servidor al procesar la imagen.',
      });
    }

    next();
  });
};

router.post(
  '/:courseId',
  authMiddleware,
  basicSanitization,
  validateParams(CourseImageParamsSchema),
  singleImageUpload,
  (req: Request, res: Response) =>
    handleUploadCourseImage(req as AuthenticatedRequest, res)
);

router.get(
  '/:courseId',
  validateParams(CourseImageParamsSchema),
  handleGetCourseImages
);

export default router;
