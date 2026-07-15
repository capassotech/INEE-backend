const IMAGE_SIGNATURES: ReadonlyArray<{ mime: string; bytes: readonly number[] }> = [
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
];

const matchesSignature = (header: Uint8Array, signature: readonly number[]): boolean => {
  if (header.length < signature.length) return false;
  return signature.every((byte, index) => header[index] === byte);
};

const isWebP = (header: Uint8Array): boolean => {
  if (header.length < 12) return false;
  return (
    matchesSignature(header, [0x52, 0x49, 0x46, 0x46]) &&
    header[8] === 0x57 &&
    header[9] === 0x45 &&
    header[10] === 0x42 &&
    header[11] === 0x50
  );
};

export const detectImageMimeFromBuffer = (buffer: Buffer): string | null => {
  if (!buffer?.length) return null;

  const header = new Uint8Array(buffer.subarray(0, 12));

  for (const { mime, bytes } of IMAGE_SIGNATURES) {
    if (matchesSignature(header, bytes)) return mime;
  }

  if (isWebP(header)) return 'image/webp';

  return null;
};

export type ImageBufferValidationResult =
  | { valid: true; mime: string }
  | { valid: false; error: string };

export const validateImageBuffer = (buffer: Buffer): ImageBufferValidationResult => {
  if (!buffer?.length) {
    return { valid: false, error: 'El archivo está vacío' };
  }

  const mime = detectImageMimeFromBuffer(buffer);
  if (!mime) {
    return {
      valid: false,
      error: 'El archivo no es una imagen válida. Usá JPEG, PNG, GIF o WebP',
    };
  }

  return { valid: true, mime };
};
