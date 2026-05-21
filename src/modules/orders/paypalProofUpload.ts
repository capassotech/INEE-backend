import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import {
  getProofMaxSizeBytes,
  getProofMimeErrorMessage,
  isAllowedProofMime,
} from '../../utils/paypalProofStorage';

const paypalProofMulter = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: getProofMaxSizeBytes() },
  fileFilter: (_req, file, cb) => {
    if (isAllowedProofMime(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(getProofMimeErrorMessage()));
    }
  },
});

export const paypalProofUpload = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  paypalProofMulter.fields([
    { name: 'proof', maxCount: 1 },
    { name: 'file', maxCount: 1 },
    { name: 'comprobante', maxCount: 1 },
  ])(req, res, (err: unknown) => {
    if (!err) {
      return next();
    }

    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          error: 'El comprobante supera el tamaño máximo (10 MB)',
        });
      }
      return res.status(400).json({ error: err.message });
    }

    const message =
      err instanceof Error ? err.message : 'Error al procesar el comprobante';
    return res.status(400).json({ error: message });
  });
};

export const getPaypalProofFileFromRequest = (
  req: Request
): Express.Multer.File | undefined => {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  return (
    files?.proof?.[0] ||
    files?.file?.[0] ||
    files?.comprobante?.[0] ||
    (req.file as Express.Multer.File | undefined)
  );
};
