import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { firestore } from '../src/config/firebase';


// Esta es la informacion que se va a insertar en la db
const TESTIMONIALS_DATA = [
  {
    nombre: 'Elías Capasso',
    contenido: 'Excelente experiencia!! Las dueñas son muy profesionales. Se nota muchísimo el buen nivel que manejan. Súper recomendable.',
    origen: 'Facebook',
    fecha: new Date()
  },
  {
    nombre: 'Maira S. Krämer',
    contenido: 'Instituto Latinoamericano de formación profesional en consultoría. Excelente! Amplío mi formación como profesional de la Abogacía. Recomiendo su formación y cursos de consultoría',
    origen: 'Facebook',
    fecha: new Date()
  },
  {
    nombre: 'Franco Cascales',
    contenido: 'Excelente lugar para estudiar, siempre están atentos a todo. Gracias',
    origen: 'Facebook',
    fecha: new Date()
  },
  {
    nombre: 'Nasareth',
    contenido: 'INEE ofrece capacitaciones de excelente nivel. Los cursos están bien estructurados, con contenidos prácticos y aplicables. Es una muy buena opción para quienes buscan aprender, actualizarse y sumar herramientas reales para el ámbito laboral.',
    origen: 'Facebook',
    fecha: new Date()
  },
];

const COLLECTION = 'testimonios'; 
const DATA = TESTIMONIALS_DATA;   

const OPTIONS = {
  addTimestamps: false,        
  dryRun: false,              
  batchSize: 10,              
};


async function insertData() {
  try {
    console.log(`\n🌱 Insertando datos en: ${COLLECTION}`);
    console.log(`📊 Total de registros: ${DATA.length}\n`);

    if (OPTIONS.dryRun) {
      console.log('🔍 MODO DRY RUN - No se insertarán datos reales\n');
      DATA.forEach((item, index) => {
        console.log(`[${index + 1}] Datos a insertar:`, JSON.stringify(item, null, 2));
      });
      console.log('\n✅ Dry run completado\n');
      process.exit(0);
    }

    const collection = firestore.collection(COLLECTION);
    const batches = chunkArray(DATA, OPTIONS.batchSize);
    
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`\n📦 Procesando lote ${i + 1}/${batches.length} (${batch.length} items)`);

      const promises = batch.map(async (data, batchIndex) => {
        try {
          const now = new Date();
          const docData = OPTIONS.addTimestamps
            ? { ...data, createdAt: now, updatedAt: now }
            : data;

          const docRef = await collection.add(docData);
          console.log(`  ✅ [${successCount + batchIndex + 1}] ID: ${docRef.id}`);
          return { success: true };
        } catch (error: any) {
          console.error(`  ❌ Error:`, error.message);
          return { success: false };
        }
      });

      const results = await Promise.all(promises);
      successCount += results.filter(r => r.success).length;
      errorCount += results.filter(r => !r.success).length;
    }

    console.log(`\n${'='.repeat(50)}`);
    console.log(`📊 Resumen Final:`);
    console.log(`   ✅ Exitosos: ${successCount}`);
    console.log(`   ❌ Errores: ${errorCount}`);
    console.log(`   📝 Total: ${DATA.length}`);
    console.log(`${'='.repeat(50)}\n`);

    process.exit(errorCount > 0 ? 1 : 0);
  } catch (error) {
    console.error('\n❌ Error general:', error);
    process.exit(1);
  }
}

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}


insertData();
