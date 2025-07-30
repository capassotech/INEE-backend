# INEE Backend

Este es el backend de INEE, una plataforma de cursos con tres interfaces:

- **Tienda online** donde los usuarios compran cursos.
- **Panel de administración** para las socias propietarias.
- **Portal de alumno** donde acceden a sus cursos comprados.

El backend está construido con **Express + TypeScript**, usa **Firebase Authentication** y **Firestore**, e integra **Mercado Pago** para los pagos.

---

## 📁 Estructura del proyecto

/src
/modules
/auth -> Autenticación con Firebase Auth
/users -> Gestión de usuarios en Firestore
/courses -> CRUD de cursos y lecciones
/purchases -> Lógica de compras de cursos
/mercado-pago -> Integración con Mercado Pago
/middleware -> Middlewares globales y de autorización
/utils -> Helpers reutilizables
/config -> Configuración de Firebase, CORS, etc.
index.ts -> Entry point del servidor Express

---

## 🔐 Autenticación

Se utiliza **Firebase Authentication**. El frontend obtiene un `idToken` desde Firebase y lo envía en el header `Authorization` como `Bearer token`.

Middleware `/middleware/authMiddleware.ts` valida este token y lo decodifica.

---

## 🔥 Firestore

Todos los datos de usuarios, cursos y compras se guardan en **Firestore**. Cada módulo tiene acceso a su propia colección:

- `users`: datos del usuario, roles, etc.
- `courses`: info del curso, módulos, lecciones.
- `purchases`: compras realizadas por usuarios.

---

## 💳 Pagos

Se usa **Mercado Pago Checkout Pro**. El backend:

1. Crea una preferencia con el curso a comprar.
2. Recibe el webhook de confirmación de pago.
3. Registra la compra en Firestore.

Secret de webhook validado con `MERCADO_PAGO_WEBHOOK_SECRET`.

---

## 🔐 Variables de entorno

Ver el archivo `.env.example` para configurar:

- Firebase
- Mercado Pago
- Puerto y URL del frontend

---

## ▶️ Scripts útiles

npm run dev        # Levanta el servidor en modo desarrollo con ts-node-dev
npm run build      # Compila el proyecto a JavaScript en /dist
npm start          # Corre el proyecto ya compilado

---

🛠 Requisitos
Node.js 18+
Cuenta en Firebase con Firestore y Auth habilitados
Cuenta de desarrollador en Mercado Pago

✍️ Autores
Desarrollado por CapassoTech para el proyecto INEE.