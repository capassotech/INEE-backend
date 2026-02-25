# Sync Producción → QA (Firestore)

Script para copiar todos los datos de Firestore de **producción** a la base de datos de **QA** de forma segura.

## Requisitos

- Node 18+
- Variables de entorno de **producción** y **QA** configuradas (ver abajo).
- Cuenta de servicio de Firebase con permisos de **lectura** en PROD y **escritura** en QA.

## Variables de entorno

Configurar **solo** cuando vayas a ejecutar el sync.

| Variable | Descripción |
|----------|-------------|
| `FIREBASE_PROJECT_ID_PROD` | Project ID del proyecto de producción |
| `FIREBASE_PRIVATE_KEY_PROD` | Private key de la cuenta de servicio (PROD) |
| `FIREBASE_CLIENT_EMAIL_PROD` | Client email de la cuenta de servicio (PROD) |
| `FIREBASE_PROJECT_ID_QA` | Project ID del proyecto QA |
| `FIREBASE_PRIVATE_KEY_QA` | Private key de la cuenta de servicio (QA) |
| `FIREBASE_CLIENT_EMAIL_QA` | Client email de la cuenta de servicio (QA) |

**Importante:** No uses las mismas variables que el backend en producción. Este script debe usar credenciales específicas para PROD (solo lectura, recomendado) y QA (escritura).

## Uso

Desde la raíz del backend (`INEE-backend`):

```bash
# 1. Simulación (recomendado primero): solo muestra qué se copiaría
npm run sync:prod-to-qa

# 2. Ejecución real (QA vacío)
npm run sync:prod-to-qa -- --execute

# 3. Ejecución real (QA ya tiene datos, sobrescribir)
npm run sync:prod-to-qa -- --execute --confirm
```

- **Sin flags:** siempre hace **dry-run** (no escribe nada en QA).
- **`--execute`:** escribe en QA.
- **`--confirm`:** obligatorio si QA ya tiene datos; evita sobrescribir por error sin confirmación.

## Seguridad

- Si `FIREBASE_PROJECT_ID_PROD` y `FIREBASE_PROJECT_ID_QA` son iguales, el script **aborta**.
- Solo se **lee** de PROD y solo se **escribe** en QA.
- Las colecciones y subcolecciones que se copian están definidas de forma explícita en el script (no se descubre nada automáticamente).

## Colecciones que se copian

- Raíz: `users`, `courses`, `events`, `ebooks`, `orders`, `carts`, `modulos`, `profesores`, `avales`, `membresias`, `examenes`, `examenes_realizados`, `inscripciones_eventos`, `reviews`, `review_reminders`, `discount_codes`, `discount_code_usage`, `suscripciones_email`, `testimonios`, `preguntas`, `respuestas`.
- Subcolecciones: `users/{uid}/progreso_modulos`, `users/{uid}/certificados`, `users/{uid}/examenes`, `users/{uid}/examenes_realizados`, `courses/{id}/profesores`, `courses/{id}/modulos`, `courses/{id}/avales`.

Si añades nuevas colecciones en el backend, hay que añadirlas en `sync-prod-to-qa.ts` en `ROOT_COLLECTIONS` o `SUBCOLLECTIONS`.

## Nota sobre Firebase Auth

Este script solo copia **Firestore**. Los usuarios de **Firebase Authentication** no se copian. Si necesitas usuarios en QA, hay que exportar/importar Auth por separado (p. ej. con la extensión o la API de Admin).
