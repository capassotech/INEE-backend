import { firestore } from "../src/config/firebase";

const COLLECTIONS = ["courses", "ebooks", "events"];
const BATCH_SIZE = 400;

async function backfillPrecioUSD() {
  for (const collectionName of COLLECTIONS) {
    console.log(`\n[BACKFILL] Procesando colección: ${collectionName}`);
    const snapshot = await firestore.collection(collectionName).get();

    if (snapshot.empty) {
      console.log(`[BACKFILL] Sin documentos en ${collectionName}`);
      continue;
    }

    let batch = firestore.batch();
    let batchOps = 0;
    let updated = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data();
      if (data.precioUSD === undefined) {
        batch.update(doc.ref, { precioUSD: null });
        batchOps += 1;
        updated += 1;
      }

      if (batchOps >= BATCH_SIZE) {
        await batch.commit();
        console.log(`[BACKFILL] Commit parcial en ${collectionName}: ${updated} actualizados`);
        batch = firestore.batch();
        batchOps = 0;
      }
    }

    if (batchOps > 0) {
      await batch.commit();
    }

    console.log(
      `[BACKFILL] ${collectionName}: ${updated} documentos con precioUSD=null`
    );
  }

  console.log("\n[BACKFILL] Finalizado");
}

backfillPrecioUSD()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[BACKFILL] Error:", error);
    process.exit(1);
  });
