import type { Request, Response } from 'express';
import { CourseImagesError } from './errors';
import { getCourseImages, uploadCourseImage } from './service';

type RequestWithMaybeFile = Request & { file?: Express.Multer.File };

export const handleUploadCourseImage = async (req: Request, res: Response) => {
  try {
    const { courseId } = req.params as { courseId: string };
    const file = (req as RequestWithMaybeFile).file;

    if (!file) {
      return res.status(400).json({
        error: 'La imagen es obligatoria',
      });
    }

    const uploadedImage = await uploadCourseImage(courseId, file);

    return res.status(201).json({
      message: 'Imagen subida correctamente',
      data: uploadedImage,
    });
  } catch (error) {
    console.error('Error al subir imagen de formación:', error);
    if (error instanceof CourseImagesError) {
      return res.status(error.statusCode).json({
        error: error.message,
      });
    }

    const message =
      error instanceof Error
        ? error.message
        : 'Error interno del servidor al subir la imagen';

    return res.status(500).json({
      error: message,
    });
  }
};

export const handleGetCourseImages = async (req: Request, res: Response) => {
  try {
    const { courseId } = req.params as { courseId: string };

    const images = await getCourseImages(courseId);

    return res.status(200).json({
      data: images,
    });
  } catch (error) {
    console.error('Error al obtener imágenes de la formación:', error);
    if (error instanceof CourseImagesError) {
      return res.status(error.statusCode).json({
        error: error.message,
      });
    }

    const message =
      error instanceof Error
        ? error.message
        : 'Error interno del servidor al obtener las imágenes';

    return res.status(500).json({
      error: message,
    });
  }
};
