import { initializeApp, cert, getApps, App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

let app: App;

if (!getApps().length) {
  // Opción 1: Usar variables de entorno (recomendado para producción)
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
    app = initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      }),
    });
  } 
  // Opción 2: Usar archivo de credenciales (para desarrollo local)
  else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    app = initializeApp({
      credential: cert(process.env.GOOGLE_APPLICATION_CREDENTIALS),
    });
  }
  // Opción 3: Usar el archivo JSON directamente (fallback)
  else {
    try {
      const serviceAccount = require("../../firebase-service-account.json");
      app = initializeApp({
        credential: cert(serviceAccount as any),
      });
    } catch (error) {
      console.error("Error: No se pudo cargar las credenciales de Firebase.");
      console.error("Por favor, configura las variables de entorno o el archivo de credenciales.");
      console.error("Opciones disponibles:");
      console.error("1. Variables de entorno: FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL");
      console.error("2. Variable GOOGLE_APPLICATION_CREDENTIALS con la ruta al archivo JSON");
      console.error("3. Archivo firebase-service-account.json en la raíz del proyecto");
      throw new Error("Configuración de Firebase incompleta");
    }
  }
} else {
  app = getApps()[0];
}

export const firebaseApp = app;
export const firebaseAuth = getAuth(app);
export const firestore = getFirestore(app);
