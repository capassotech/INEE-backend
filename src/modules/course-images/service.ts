import { Readable } from 'stream';
import type { drive_v3 } from '@googleapis/drive';
import { firestore } from '../../config/firebase';
import { getDriveClient, getFormacionesRootFolderId } from '../../utils/googleDrive/client';
import { CourseImagesError } from './errors';

export interface CourseImage {
  id: string;
  name: string;
  mimeType?: string | null;
  webViewLink?: string | null;
  webContentLink?: string | null;
  thumbnailLink?: string | null;
  directLink: string;
  createdTime?: string | null;
  modifiedTime?: string | null;
}

const DRIVE_FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
const PLATFORM_FOLDER_NAME = 'PLATAFORMA';
const FORMACIONES_FOLDER_NAME = 'FORMACIONES';

interface ResolveFolderOptions {
  createMissing: boolean;
}

const COURSES_COLLECTION = firestore.collection('courses');

const escapeQueryValue = (value: string): string => value.replace(/'/g, "\\'");

const getCourseTitle = async (courseId: string): Promise<string> => {
  const courseDoc = await COURSES_COLLECTION.doc(courseId).get();

  if (!courseDoc.exists) {
    throw new CourseImagesError('La formación especificada no existe.', 404);
  }

  const data = courseDoc.data() as { titulo?: string } | undefined;
  const title = data?.titulo?.trim();

  if (!title) {
    throw new CourseImagesError(
      'La formación no tiene un título configurado en la base de datos.',
      400
    );
  }

  return title;
};

const findChildFolder = async (
  drive: drive_v3.Drive,
  parentFolderId: string,
  name: string
): Promise<drive_v3.Schema$File | undefined> => {
  const queryName = escapeQueryValue(name);
  const response = await drive.files.list({
    q: `name = '${queryName}' and mimeType = '${DRIVE_FOLDER_MIME_TYPE}' and '${parentFolderId}' in parents and trashed = false`,
    fields: 'files(id, name)',
    spaces: 'drive',
  });

  return response.data.files?.[0];
};

const createChildFolder = async (
  drive: drive_v3.Drive,
  parentFolderId: string,
  name: string
): Promise<drive_v3.Schema$File> => {
  const folderMetadata = {
    name,
    mimeType: DRIVE_FOLDER_MIME_TYPE,
    parents: [parentFolderId],
  } satisfies drive_v3.Schema$File;

  const { data } = await drive.files.create({
    requestBody: folderMetadata,
    fields: 'id, name',
  });

  if (!data.id) {
    throw new Error('No fue posible crear la carpeta en Google Drive');
  }

  return data;
};

const resolveFolderPath = async (
  drive: drive_v3.Drive,
  startingFolderId: string,
  segments: string[],
  options: ResolveFolderOptions
): Promise<string | undefined> => {
  let currentFolderId = startingFolderId;

  for (const segment of segments) {
    const existingFolder = await findChildFolder(drive, currentFolderId, segment);

    if (existingFolder?.id) {
      currentFolderId = existingFolder.id;
      continue;
    }

    if (!options.createMissing) {
      return undefined;
    }

    const newFolder = await createChildFolder(drive, currentFolderId, segment);
    currentFolderId = newFolder.id!;
  }

  return currentFolderId;
};

const buildDirectLink = (fileId: string): string =>
  `https://drive.google.com/uc?export=view&id=${fileId}`;

export const uploadCourseImage = async (
  courseId: string,
  file: Express.Multer.File
): Promise<CourseImage> => {
  const drive = getDriveClient();
  const rootFolderId = getFormacionesRootFolderId();

  const courseTitle = await getCourseTitle(courseId);
  const courseFolderId = await resolveFolderPath(
    drive,
    rootFolderId,
    [PLATFORM_FOLDER_NAME, FORMACIONES_FOLDER_NAME, courseTitle],
    { createMissing: true }
  );

  if (!courseFolderId) {
    throw new Error('No fue posible resolver la carpeta de destino en Google Drive');
  }

  const media = {
    mimeType: file.mimetype,
    body: Readable.from(file.buffer),
  };

  const { data } = await drive.files.create({
    requestBody: {
      name: file.originalname,
      parents: [courseFolderId],
    },
    media,
    fields: 'id, name, mimeType, webViewLink, webContentLink, thumbnailLink, createdTime, modifiedTime',
  });

  if (!data.id) {
    throw new Error('No se pudo subir la imagen a Google Drive');
  }

  await drive.permissions.create({
    fileId: data.id,
    requestBody: {
      role: 'reader',
      type: 'anyone',
    },
  });

  return {
    id: data.id,
    name: data.name ?? file.originalname,
    mimeType: data.mimeType,
    webViewLink: data.webViewLink,
    webContentLink: data.webContentLink,
    thumbnailLink: data.thumbnailLink,
    directLink: buildDirectLink(data.id),
    createdTime: data.createdTime,
    modifiedTime: data.modifiedTime,
  };
};

export const getCourseImages = async (courseId: string): Promise<CourseImage[]> => {
  const drive = getDriveClient();
  const rootFolderId = getFormacionesRootFolderId();

  const courseTitle = await getCourseTitle(courseId);
  const courseFolderId = await resolveFolderPath(
    drive,
    rootFolderId,
    [PLATFORM_FOLDER_NAME, FORMACIONES_FOLDER_NAME, courseTitle],
    { createMissing: false }
  );

  if (!courseFolderId) {
    return [];
  }

  const response = await drive.files.list({
    q: `'${courseFolderId}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType, webViewLink, webContentLink, thumbnailLink, createdTime, modifiedTime)',
    orderBy: 'createdTime desc',
  });

  return (
    response.data.files?.map((file) => ({
      id: file.id!,
      name: file.name ?? 'imagen-sin-nombre',
      mimeType: file.mimeType,
      webViewLink: file.webViewLink,
      webContentLink: file.webContentLink,
      thumbnailLink: file.thumbnailLink,
      directLink: buildDirectLink(file.id!),
      createdTime: file.createdTime,
      modifiedTime: file.modifiedTime,
    })) ?? []
  );
};
