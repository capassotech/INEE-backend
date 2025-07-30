// /src/config/firebase.ts
import { initializeApp, cert, getApps, App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import * as serviceAccount from '../../firebase-service-account.json';

let app: App;

if (!getApps().length) {
  app = initializeApp({
    credential: cert(serviceAccount as any),
  });
} else {
  app = getApps()[0];
}

export const firebaseApp = app;
export const firebaseAuth = getAuth(app);
export const firestore = getFirestore(app);