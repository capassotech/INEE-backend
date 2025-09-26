import { drive_v3, auth } from '@googleapis/drive';

const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive'];

let driveClient: drive_v3.Drive | null = null;

const createDriveClient = (): drive_v3.Drive => {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!clientEmail || !privateKey) {
    throw new Error(
      'Las credenciales de Google Drive no están configuradas. Define GOOGLE_CLIENT_EMAIL y GOOGLE_PRIVATE_KEY en el entorno.'
    );
  }

  const authClient = new auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: DRIVE_SCOPES,
  });

  return new drive_v3.Drive({ auth: authClient });
};

export const getDriveClient = (): drive_v3.Drive => {
  if (!driveClient) {
    driveClient = createDriveClient();
  }
  return driveClient;
};

export const getFormacionesRootFolderId = (): string => {
  const rootFolderId = process.env.GOOGLE_DRIVE_FORMACIONES_FOLDER_ID;

  if (!rootFolderId) {
    throw new Error(
      'La carpeta raíz de Google Drive para formaciones no está configurada. Define GOOGLE_DRIVE_FORMACIONES_FOLDER_ID en el entorno.'
    );
  }

  return rootFolderId;
};
