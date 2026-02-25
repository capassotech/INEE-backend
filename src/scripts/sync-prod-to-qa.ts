/**
 * Script seguro: copia datos de Firestore PRODUCCIÓN → QA.
 *
 * Medidas de seguridad:
 * - Requiere variables de entorno distintas para PROD y QA.
 * - Si PROD y QA tienen el mismo projectId, aborta.
 * - Por defecto hace dry-run (solo simula); usar --execute para escribir.
 * - Requiere --confirm si QA ya tiene datos y se va a sobrescribir.
 * - Solo LECTURA en PROD; solo ESCRITURA en QA.
 *
 * Uso:
 *   npx ts-node --transpile-only src/scripts/sync-prod-to-qa.ts [--execute] [--confirm]
 *
 * Variables de entorno (todas obligatorias para ejecutar):
 *   PROD:  FIREBASE_PROJECT_ID_PROD, FIREBASE_PRIVATE_KEY_PROD, FIREBASE_CLIENT_EMAIL_PROD
 *   QA:    FIREBASE_PROJECT_ID_QA,   FIREBASE_PRIVATE_KEY_QA,   FIREBASE_CLIENT_EMAIL_QA
 */

import * as dotenv from "dotenv";
dotenv.config();

import { initializeApp, cert, getApps, App } from "firebase-admin/app";
import {
  getFirestore,
  Firestore,
  DocumentReference,
  Timestamp,
  DocumentData,
} from "firebase-admin/firestore";

const BATCH_SIZE = 400; // Firestore permite hasta 500 por batch
const DRY_RUN = !process.argv.includes("--execute");
const CONFIRM_OVERWRITE = process.argv.includes("--confirm");

type SubcollectionDef = { parentCollection: string; subcollectionName: string };

// Colecciones raíz a copiar (orden: sin dependencias primero)
const ROOT_COLLECTIONS = [
  "profesores",
  "modulos",
  "courses",
  "events",
  "ebooks",
  "avales",
  "membresias",
  "examenes",
  "preguntas",
  "respuestas",
  "testimonios",
  "discount_codes",
  "discount_code_usage",
  "suscripciones_email",
  "users",
  "orders",
  "carts",
  "inscripciones_eventos",
  "reviews",
  "review_reminders",
  "examenes_realizados",
];

// Subcolecciones: { colección padre, nombre subcolección }
const SUBCOLLECTIONS: SubcollectionDef[] = [
  { parentCollection: "users", subcollectionName: "progreso_modulos" },
  { parentCollection: "users", subcollectionName: "certificados" },
  { parentCollection: "users", subcollectionName: "examenes" },
  { parentCollection: "users", subcollectionName: "examenes_realizados" },
  { parentCollection: "courses", subcollectionName: "profesores" },
  { parentCollection: "courses", subcollectionName: "modulos" },
  { parentCollection: "courses", subcollectionName: "avales" },
];

function getProdCreds() {
  const projectId = process.env.FIREBASE_PROJECT_ID_PROD;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY_PROD?.replace(
    /\\n/g,
    "\n"
  );
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL_PROD;
  if (!projectId || !privateKey || !clientEmail) {
    throw new Error(
      "Faltan variables de PROD: FIREBASE_PROJECT_ID_PROD, FIREBASE_PRIVATE_KEY_PROD, FIREBASE_CLIENT_EMAIL_PROD"
    );
  }
  return { projectId, privateKey, clientEmail };
}

function getQACreds() {
  const projectId = process.env.FIREBASE_PROJECT_ID_QA;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY_QA?.replace(
    /\\n/g,
    "\n"
  );
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL_QA;
  if (!projectId || !privateKey || !clientEmail) {
    throw new Error(
      "Faltan variables de QA: FIREBASE_PROJECT_ID_QA, FIREBASE_PRIVATE_KEY_QA, FIREBASE_CLIENT_EMAIL_QA"
    );
  }
  return { projectId, privateKey, clientEmail };
}

function initProdApp(): App {
  const creds = getProdCreds();
  if (getApps().length === 0) {
    return initializeApp(
      {
        credential: cert({
          projectId: creds.projectId,
          privateKey: creds.privateKey,
          clientEmail: creds.clientEmail,
        }),
      },
      "prod"
    );
  }
  const existing = getApps().find((a) => a.name === "prod");
  if (existing) return existing as App;
  return initializeApp(
    {
      credential: cert({
        projectId: creds.projectId,
        privateKey: creds.privateKey,
        clientEmail: creds.clientEmail,
      }),
    },
    "prod"
  );
}

function initQAApp(): App {
  const creds = getQACreds();
  const existing = getApps().find((a) => a.name === "qa");
  if (existing) return existing as App;
  return initializeApp(
    {
      credential: cert({
        projectId: creds.projectId,
        privateKey: creds.privateKey,
        clientEmail: creds.clientEmail,
      }),
    },
    "qa"
  );
}

/** Convierte datos leídos de PROD para escribir en QA: referencias PROD → QA. */
function cloneDataForQA(
  data: DocumentData | undefined,
  qaDb: Firestore
): DocumentData | undefined {
  if (data === undefined || data === null) return data;

  if (typeof data !== "object") return data;

  if (data instanceof Date) return data;

  if (data instanceof Timestamp) return data;

  if (data instanceof DocumentReference) {
    return qaDb.doc(data.path);
  }

  if (Array.isArray(data)) {
    return data.map((item) => cloneDataForQA(item, qaDb));
  }

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    out[key] = cloneDataForQA(value as DocumentData, qaDb);
  }
  return out;
}

async function copyCollection(
  prodDb: Firestore,
  qaDb: Firestore,
  collectionPath: string,
  dryRun: boolean
): Promise<{ read: number; written: number; errors: string[] }> {
  const col = prodDb.collection(collectionPath);
  const snapshot = await col.get();
  const read = snapshot.size;
  const errors: string[] = [];
  let written = 0;

  if (snapshot.empty) {
    return { read: 0, written: 0, errors };
  }

  if (!dryRun) {
    let batch = qaDb.batch();
    let ops = 0;
    for (const doc of snapshot.docs) {
      const data = cloneDataForQA(doc.data(), qaDb);
      const qaRef = qaDb.collection(collectionPath).doc(doc.id);
      batch.set(qaRef, data as DocumentData);
      written++;
      ops++;
      if (ops >= BATCH_SIZE) {
        await batch.commit();
        batch = qaDb.batch();
        ops = 0;
      }
    }
    if (ops > 0) await batch.commit();
  } else {
    written = read;
  }

  return { read, written, errors };
}

async function copySubcollection(
  prodDb: Firestore,
  qaDb: Firestore,
  parentCollection: string,
  subcollectionName: string,
  dryRun: boolean
): Promise<{ read: number; written: number; errors: string[] }> {
  const parentSnap = await prodDb.collection(parentCollection).get();
  let totalRead = 0;
  let totalWritten = 0;
  const errors: string[] = [];

  for (const parentDoc of parentSnap.docs) {
    const subPath = `${parentCollection}/${parentDoc.id}/${subcollectionName}`;
    const subSnap = await prodDb.collection(subPath).get();
    totalRead += subSnap.size;

    if (subSnap.empty) continue;

    if (!dryRun) {
      let batch = qaDb.batch();
      let ops = 0;
      for (const doc of subSnap.docs) {
        const data = cloneDataForQA(doc.data(), qaDb);
        const qaRef = qaDb
          .collection(parentCollection)
          .doc(parentDoc.id)
          .collection(subcollectionName)
          .doc(doc.id);
        batch.set(qaRef, data as DocumentData);
        totalWritten++;
        ops++;
        if (ops >= BATCH_SIZE) {
          await batch.commit();
          batch = qaDb.batch();
          ops = 0;
        }
      }
      if (ops > 0) await batch.commit();
    } else {
      totalWritten += subSnap.size;
    }
  }

  return { read: totalRead, written: totalWritten, errors };
}

/** Devuelve true si la colección tiene al menos un documento. */
async function hasAnyDoc(db: Firestore, collectionPath: string): Promise<boolean> {
  const snap = await db.collection(collectionPath).limit(1).get();
  return !snap.empty;
}

async function main() {
  console.log("\n=== Sync PROD → QA (Firestore) ===\n");

  const prodCreds = getProdCreds();
  const qaCreds = getQACreds();

  if (prodCreds.projectId === qaCreds.projectId) {
    console.error(
      "ERROR: PROD y QA tienen el mismo FIREBASE_PROJECT_ID. Abortando para evitar sobrescribir producción."
    );
    process.exit(1);
  }

  console.log(`Origen (solo lectura):  ${prodCreds.projectId}`);
  console.log(`Destino (escritura):    ${qaCreds.projectId}`);
  console.log(`Modo:                   ${DRY_RUN ? "DRY-RUN (simulación)" : "EJECUCIÓN REAL"}\n`);

  const prodApp = initProdApp();
  const qaApp = initQAApp();
  const prodDb = getFirestore(prodApp);
  const qaDb = getFirestore(qaApp);

  if (!DRY_RUN) {
    const qaHasData = await Promise.all(
      ROOT_COLLECTIONS.map((name) => hasAnyDoc(qaDb, name))
    ).then((arr) => arr.some(Boolean));
    if (qaHasData && !CONFIRM_OVERWRITE) {
      console.error(
        "QA ya tiene datos en alguna colección. Usa --confirm para confirmar sobrescritura."
      );
      process.exit(1);
    }
  }

  const results: Array<{
    path: string;
    read: number;
    written: number;
    errors: string[];
  }> = [];

  for (const coll of ROOT_COLLECTIONS) {
    process.stdout.write(`  ${coll} ... `);
    const r = await copyCollection(prodDb, qaDb, coll, DRY_RUN);
    results.push({ path: coll, ...r });
    console.log(`lectura: ${r.read}, escritura: ${r.written}`);
  }

  for (const { parentCollection, subcollectionName } of SUBCOLLECTIONS) {
    const path = `${parentCollection}/${subcollectionName}`;
    process.stdout.write(`  ${path} (sub) ... `);
    const r = await copySubcollection(
      prodDb,
      qaDb,
      parentCollection,
      subcollectionName,
      DRY_RUN
    );
    results.push({ path, ...r });
    console.log(`lectura: ${r.read}, escritura: ${r.written}`);
  }

  const totalRead = results.reduce((s, x) => s + x.read, 0);
  const totalWritten = results.reduce((s, x) => s + x.written, 0);
  const allErrors = results.flatMap((r) => r.errors);

  console.log("\n--- Resumen ---");
  console.log(`Total documentos leídos (PROD):  ${totalRead}`);
  console.log(`Total documentos escritos (QA):  ${totalWritten}`);
  if (allErrors.length > 0) {
    console.log("Errores:", allErrors);
  }
  if (DRY_RUN) {
    console.log("\nFue una simulación. Para ejecutar de verdad: npm run sync:prod-to-qa -- --execute [--confirm]");
  }
  console.log("");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
