import { Request, Response } from 'express';
import { getCourseImages, uploadCourseImage } from './service';

export const handleUploadCourseImage = async (req: Request, res: Response) => {
  try {
    const { courseId } = req.params as { courseId: string };
    const file = req.file;

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
    const message =
      error instanceof Error
        ? error.message
        : 'Error interno del servidor al obtener las imágenes';

    return res.status(500).json({
      error: message,
    });
  }
};
