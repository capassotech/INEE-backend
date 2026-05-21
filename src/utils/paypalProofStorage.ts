import { randomUUID } from 'crypto';
import { storage } from '../config/firebase';

const PROOF_MIME_TO_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
};

const ALLOWED_MIMES = new Set(Object.keys(PROOF_MIME_TO_EXT));
const MAX_PROOF_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export const isAllowedProofMime = (mime: string): boolean =>
  ALLOWED_MIMES.has((mime || '').toLowerCase());

export const getProofMimeErrorMessage = (): string =>
  'Tipo de archivo no permitido. Usá PDF, JPG o PNG';

export const getProofMaxSizeBytes = (): number => MAX_PROOF_SIZE_BYTES;

const buildStorageDownloadUrl = (
  bucketName: string,
  objectPath: string,
  downloadToken: string
) => {
  const encoded = encodeURIComponent(objectPath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encoded}?alt=media&token=${downloadToken}`;
};

export const uploadPaypalProofToStorage = async (
  orderId: string,
  file: { buffer: Buffer; mimetype: string }
): Promise<string> => {
  const mime = (file.mimetype || '').toLowerCase();
  if (!isAllowedProofMime(mime)) {
    throw new Error(getProofMimeErrorMessage());
  }

  if (!file.buffer?.length) {
    throw new Error('El archivo del comprobante está vacío');
  }

  if (file.buffer.length > MAX_PROOF_SIZE_BYTES) {
    throw new Error('El comprobante supera el tamaño máximo (10 MB)');
  }

  const bucket = storage.bucket();
  const ext = PROOF_MIME_TO_EXT[mime];
  const objectPath = `payment-proofs/paypal/${orderId}/${randomUUID()}.${ext}`;
  const downloadToken = randomUUID();

  const storageFile = bucket.file(objectPath);
  await storageFile.save(file.buffer, {
    resumable: false,
    metadata: {
      contentType: mime,
      metadata: {
        firebaseStorageDownloadTokens: downloadToken,
        orderId,
        paymentMethod: 'paypal_manual',
      },
    },
  });

  return buildStorageDownloadUrl(bucket.name, objectPath, downloadToken);
};
