# Expiración de sesión (24 horas)

## Resumen

Las sesiones de usuario expiran **24 horas después del login exitoso**. La expiración se controla **exclusivamente en el servidor** (Firestore + middleware). El frontend no debe calcular ni persistir la expiración en `localStorage`.

Firebase Authentication sigue validando el `idToken` en cada request. Además, el backend verifica que exista una sesión activa registrada en el servidor y que no haya superado el límite de 24 horas.

## Dónde se guarda la fecha de login

Al autenticarse exitosamente, el backend crea un documento en Firestore:

**Colección:** `user_sessions/{sessionId}`

| Campo       | Descripción                                      |
|------------|--------------------------------------------------|
| `uid`      | ID del usuario en Firebase                       |
| `loginAt`  | Fecha/hora exacta del login (Timestamp)          |
| `expiresAt`| `loginAt + 24 horas` (Timestamp)                 |
| `active`   | `true` mientras la sesión es válida              |

También se actualiza el documento del usuario en **`users/{uid}`**:

| Campo             | Descripción                                |
|------------------|--------------------------------------------|
| `activeSessionId`| ID de la sesión activa actual              |
| `sessionLoginAt` | Copia de `loginAt` para consultas rápidas  |
| `sessionExpiresAt` | Copia de `expiresAt`                   |
| `ultimoLogin`    | Último login registrado                    |

**Cookie HTTP (opcional):** en respuestas de login se envía la cookie `inee_session` (`httpOnly`, `sameSite=lax`) con el `sessionId`. El cliente también recibe `sessionId` y `sessionExpiresAt` en el JSON de respuesta.

**Header opcional:** `X-Session-Id` — si se envía, debe coincidir con `activeSessionId`. Si no se envía, el middleware usa la sesión activa del usuario en Firestore.

## Cómo se calcula la expiración

```
expiresAt = loginAt + SESSION_DURATION_HOURS (default: 24)
```

Variable de entorno opcional:

```env
SESSION_DURATION_HOURS=24
```

En cada request protegido, `authMiddleware`:

1. Verifica el `Bearer` token con Firebase Admin (`verifyIdToken`).
2. Obtiene la sesión activa del usuario desde Firestore.
3. Compara `Date.now()` con `expiresAt`.
4. Si expiró → **401 Unauthorized**, invalida la sesión y revoca refresh tokens de Firebase.

## Flujos que registran sesión (login exitoso)

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/auth/register` | POST | Registro con email/password |
| `/api/auth/login` | POST | Login email/password |
| `/api/auth/google` | POST | Login/registro con Google |
| `/api/auth/link-password` | POST | Vincular password a cuenta Google |
| `/api/auth/link-google` | POST | Vincular Google a cuenta existente |
| `/api/auth/validate-token` | POST | SSO desde la tienda |

Logs en consola:

- `[SESSION] Login exitoso — uid=..., sessionId=..., loginAt=..., expiresAt=...`
- `[SESSION] Sesión expirada — uid=..., sessionId=..., ...`
- `[SESSION] Sesión inválida — uid=..., motivo=...`
- `[AUTH] Sesión inválida — motivo=...` (token Firebase ausente o inválido)

## Endpoints protegidos

Todo endpoint que usa **`authMiddleware`** exige sesión válida y no expirada. Incluye, entre otros:

### Auth (`/api/auth`)
- `GET /me`
- `PUT /me`
- `PUT /additional-data`
- `PATCH /update-dni`
- `DELETE /me`
- `POST /refresh-token`

### Usuarios (`/api/users`)
- `GET /me`
- `POST /`
- `PUT /:id/profile-photo`

### Órdenes PayPal (`/api/orders`)
- `POST /paypal/comprobante`, `/paypal/proof`
- `PATCH /:orderId/status` (admin)
- `POST /:orderId/assign-products`, `/asignar-productos` (admin)

### Contenido y progreso
- `/api/formaciones` — crear, editar, eliminar
- `/api/eventos` — crear, editar, eliminar, inscripciones admin
- `/api/ebooks` — crear, editar, eliminar
- `/api/progreso` — rutas autenticadas
- `/api/inscripciones-eventos` — rutas autenticadas
- `/api/certificados` — rutas autenticadas
- `/api/examenes-realizados` — rutas autenticadas
- `/api/reviews` — crear reseña

### Admin
- `/api/discount-codes` — crear, editar, eliminar
- `/api/examenes` — crear, editar, eliminar
- `/api/avales` — crear, editar, eliminar
- `/api/recomendaciones` — crear, editar, eliminar
- `/api/mercado-pago-accounts` — gestión de cuentas MP
- `/api/profesores` — crear, editar, eliminar

### Respuestas de error

| Código HTTP | `code` (JSON)        | Significado                          |
|-------------|----------------------|--------------------------------------|
| 401         | `SESSION_EXPIRED`    | Pasaron más de 24 h desde el login   |
| 401         | `SESSION_INVALID`    | Sesión inexistente, inactiva o distinta |
| 401         | `AUTH_TOKEN_*`       | Problema con el token Firebase       |

## Archivos relevantes

| Archivo | Rol |
|---------|-----|
| `src/services/userSession.ts` | Crear, validar e invalidar sesiones |
| `src/middleware/authMiddleware.ts` | Guard centralizado |
| `src/modules/auth/controller.ts` | Registro de sesión en logins exitosos |

## Notas para el frontend

- **No** usar `localStorage` para controlar expiración.
- Enviar siempre `Authorization: Bearer <idToken>`.
- Opcional: enviar `X-Session-Id` con el valor recibido en login.
- Ante `401` con `SESSION_EXPIRED` o `SESSION_INVALID`, redirigir al login.
