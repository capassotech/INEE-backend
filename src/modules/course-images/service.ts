import { Readable } from 'stream';
import type { drive_v3 } from '@googleapis/drive';
import { getDriveClient, getFormacionesRootFolderId } from '../../utils/googleDrive/client';

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

const escapeQueryValue = (value: string): string => value.replace(/'/g, "\\'");

const findCourseFolder = async (
  drive: drive_v3.Drive,
  rootFolderId: string,
  courseId: string
): Promise<drive_v3.Schema$File | undefined> => {
  const queryCourseId = escapeQueryValue(courseId);
  const response = await drive.files.list({
    q: `name = '${queryCourseId}' and mimeType = '${DRIVE_FOLDER_MIME_TYPE}' and '${rootFolderId}' in parents and trashed = false`,
    fields: 'files(id, name)',
    spaces: 'drive',
  });

  return response.data.files?.[0];
};

const createCourseFolder = async (
  drive: drive_v3.Drive,
  rootFolderId: string,
  courseId: string
): Promise<drive_v3.Schema$File> => {
  const folderMetadata = {
    name: courseId,
    mimeType: DRIVE_FOLDER_MIME_TYPE,
    parents: [rootFolderId],
  } satisfies drive_v3.Schema$File;

  const { data } = await drive.files.create({
    requestBody: folderMetadata,
    fields: 'id, name',
  });

  if (!data.id) {
    throw new Error('No fue posible crear la carpeta para la formación en Google Drive');
  }

  return data;
};

const ensureCourseFolder = async (
  drive: drive_v3.Drive,
  rootFolderId: string,
  courseId: string
): Promise<string> => {
  const existingFolder = await findCourseFolder(drive, rootFolderId, courseId);
  if (existingFolder?.id) {
    return existingFolder.id;
  }

  const newFolder = await createCourseFolder(drive, rootFolderId, courseId);
  return newFolder.id!;
};

const buildDirectLink = (fileId: string): string =>
  `https://drive.google.com/uc?export=view&id=${fileId}`;

export const uploadCourseImage = async (
  courseId: string,
  file: Express.Multer.File
): Promise<CourseImage> => {
  const drive = getDriveClient();
  const rootFolderId = getFormacionesRootFolderId();

  const courseFolderId = await ensureCourseFolder(drive, rootFolderId, courseId);

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

  const existingFolder = await findCourseFolder(drive, rootFolderId, courseId);

  if (!existingFolder?.id) {
    return [];
  }

  const response = await drive.files.list({
    q: `'${existingFolder.id}' in parents and trashed = false`,
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
