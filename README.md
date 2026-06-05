# INEE Backend

Backend de la plataforma INEE con Express + TypeScript, Firebase y Mercado Pago.

## 🚀 Inicio Rápido

```sh
npm i
cp .env.example .env  # Configura las variables de entorno
npm run dev
```

## 🔧 Configuración de Entornos

El backend debe configurarse con las credenciales de Firebase correspondientes al entorno:

- **QA**: Usa credenciales del proyecto Firebase `inee-qa`
- **Producción**: Usa credenciales del proyecto Firebase `inee-admin`

### Variables Requeridas

- `FIREBASE_PROJECT_ID` - ID del proyecto Firebase
- `FIREBASE_CLIENT_EMAIL` - Email del service account
- `FIREBASE_PRIVATE_KEY` - Clave privada del service account
- `MERCADO_PAGO_ACCESS_TOKEN` - Token de acceso de Mercado Pago
- `MERCADO_PAGO_WEBHOOK_SECRET` - Secret para validar webhooks
- `FRONTEND_URL` - URL del frontend (para CORS)
- `PORT` - Puerto del servidor (default: 3000)

**Importante:** El backend de QA debe usar las credenciales de Firebase de QA, y el de producción las de producción. Esto asegura que los tokens generados sean válidos para el proyecto correcto.

## 📁 Estructura

```
/src
  /modules
    /auth       -> Autenticación con Firebase Auth
    /users      -> Gestión de usuarios
    /courses    -> CRUD de formaciones y lecciones
    /purchases   -> Lógica de compras
    /mercado-pago -> Integración con Mercado Pago
  /middleware   -> Middlewares de autenticación y validación
  /config       -> Configuración de Firebase, CORS, etc.
```

## 🔐 Autenticación

El frontend envía un `idToken` de Firebase en el header `Authorization: Bearer <token>`. El middleware `authMiddleware.ts` valida el token con Firebase Admin y verifica la **sesión server-side** (expiración a 24 h desde el login).

Documentación completa: [docs/SESSION_EXPIRATION.md](./docs/SESSION_EXPIRATION.md)

## 🔥 Firestore

Datos almacenados en Firestore:
- `users` - Usuarios y roles
- `courses` - formaciones, módulos y lecciones
- `purchases` - Compras realizadas

## 💳 Mercado Pago

Integración con Checkout Pro:
1. Backend crea preferencia de pago
2. Recibe webhook de confirmación
3. Registra compra en Firestore

## 📦 Scripts

```sh
npm run dev    # Desarrollo con hot-reload
npm run build  # Compilar a JavaScript
npm start      # Ejecutar versión compilada
```

## 🛠 Requisitos

- Node.js 18+
- Cuenta Firebase con Firestore y Auth
- Cuenta Mercado Pago (desarrollador)
