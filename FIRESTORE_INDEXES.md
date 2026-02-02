# Índices de Firestore

Este documento describe los índices compuestos necesarios para las consultas de Firestore en el proyecto.

## Archivo de Índices

Los índices están definidos en `firestore.indexes.json` en la raíz del proyecto.

## Desplegar Índices

**Importante:** Los índices se crean en Firebase, independientemente de dónde esté desplegado el backend (Render, Heroku, etc.). El backend solo hace las consultas, pero los índices se gestionan en Firebase.

### Opción 1: Usando Firebase CLI (Recomendado)

```bash
# 1. Instalar Firebase CLI si no lo tienes
npm install -g firebase-tools

# 2. Navegar al directorio del backend
cd INEE-backend

# 3. Iniciar sesión en Firebase (se abrirá el navegador)
firebase login

# 4. Seleccionar el proyecto (si tienes múltiples proyectos)
firebase use --add
# O si ya sabes el ID del proyecto:
firebase use TU_PROJECT_ID

# 5. Desplegar solo los índices (sin reglas ni otras cosas)
firebase deploy --only firestore:indexes
```

**Nota:** Si no tienes `firebase.json`, se creará automáticamente. Si ya existe, asegúrate de que tenga la configuración de Firestore.

### Opción 2: Desde Firebase Console (Manual)

Si prefieres crear los índices manualmente desde la consola web:

1. Ve a [Firebase Console](https://console.firebase.google.com/)
2. Selecciona tu proyecto
3. Ve a **Firestore Database** > **Índices**
4. Haz clic en **Agregar índice**
5. Para cada índice, completa:
   - **Colección**: El nombre de la colección (ej: `purchases`, `reviews`, `courses`)
   - **Campos del índice**: Agrega cada campo con su orden (ASCENDING o DESCENDING)
   - **Alcance de la consulta**: Selecciona "Colección"

**Índices a crear manualmente:**

Ver la sección "Índices Definidos" más abajo para la lista completa con todos los detalles.

## Índices Definidos

### Purchases (Compras)

1. **userId + paymentStatus**
   - Para: `listUserPurchases` - Listar compras aprobadas de un usuario
   - Query: `.where('userId', '==', uid).where('paymentStatus', '==', 'approved')`

2. **userId + courseId + paymentStatus**
   - Para: `hasAccessToCourse` - Verificar acceso a un formacion
   - Query: `.where('userId', '==', uid).where('courseId', '==', courseId).where('paymentStatus', '==', 'approved')`

3. **userId + courseId**
   - Para: `handleWebhook` (Mercado Pago) - Verificar compra existente
   - Query: `.where('userId', '==', userId).where('courseId', '==', courseId)`

### Reviews (Reseñas)

1. **courseId + createdAt (DESC)**
   - Para: `getReviewsByCourse` - Obtener reseñas de un formacion ordenadas por fecha
   - Query: `.where('courseId', '==', courseId).orderBy('createdAt', 'desc')`

2. **userId + courseId**
   - Para: `createReview` - Verificar si el usuario ya dejó una reseña
   - Query: `.where('userId', '==', userId).where('courseId', '==', courseId)`

### Review Reminders (Recordatorios de Reseñas)

1. **userId + courseId**
   - Para: `reminderReview` - Verificar si ya existe un recordatorio programado
   - Query: `.where('userId', '==', userId).where('courseId', '==', courseId)`

### Inscripciones Eventos

1. **userId + eventoId + estado**
   - Para: Verificar si el usuario ya está inscrito a un evento
   - Query: `.where('userId', '==', userId).where('eventoId', '==', eventoId).where('estado', '==', 'activa')`
   - Usado en: `verificarDisponibilidad`, `inscribirseEvento`, `webhookPagoEvento`, `comprarEInscribirse`, `verificarInscripcion`

2. **userId + estado**
   - Para: Listar todas las inscripciones activas de un usuario
   - Query: `.where('userId', '==', userId).where('estado', '==', 'activa')`
   - Usado en: `listarMisInscripciones`

### Courses (formaciones)

1. **id_profesor + fechaCreacion (DESC)**
   - Para: Consultas de formaciones por profesor ordenados por fecha

2. **pilar + __name__** (Índice automático)
   - Para: `getAllCourses` - Filtrar formaciones por pilar con paginación
   - Query: `.where('pilar', '==', pilar).orderBy('__name__')`
   - **Nota**: Firestore crea este índice automáticamente cuando se necesita

3. **type + __name__** (Índice automático)
   - Para: `getAllCourses` - Filtrar formaciones por tipo con paginación
   - Query: `.where('type', '==', type).orderBy('__name__')`
   - **Nota**: Firestore crea este índice automáticamente cuando se necesita

4. **nivel + __name__** (Índice automático)
   - Para: `getAllCourses` - Filtrar formaciones por nivel con paginación
   - Query: `.where('nivel', '==', nivel).orderBy('__name__')`
   - **Nota**: Firestore crea este índice automáticamente cuando se necesita

### Users (Usuarios)

1. **email**
   - Para: Búsqueda de usuarios por email
   - Query: `.where('email', '==', email)`

2. **dni**
   - Para: Validación de DNI único
   - Query: `.where('dni', '==', dni)`

### Suscripciones Email

1. **email**
   - Para: Verificar si un email ya está suscrito
   - Query: `.where('email', '==', email)`

## Notas Importantes

- Los índices pueden tardar varios minutos en construirse, especialmente si hay muchos documentos
- Firestore creará automáticamente índices simples para campos individuales
- Los índices compuestos son necesarios cuando se combinan múltiples `where()` o `where()` + `orderBy()`
- El orden de los campos en el índice debe coincidir con el orden en la query

## Verificar Estado de los Índices

### Desde Firebase CLI:
```bash
# Ver índices desplegados
firebase firestore:indexes

# Ver estado de construcción
# Ve a Firebase Console > Firestore > Índices
```

### Desde Firebase Console:
1. Ve a [Firebase Console](https://console.firebase.google.com/)
2. Selecciona tu proyecto
3. Ve a **Firestore Database** > **Índices**
4. Verás todos los índices con su estado:
   - **Enabled** (Habilitado) - Listo para usar
   - **Building** (Construyendo) - Aún se está creando (puede tardar minutos)
   - **Error** (Error) - Hubo un problema, revisa los detalles

## Solución de Problemas

Si una query falla con error de índice faltante:

1. Verifica que el índice esté en `firestore.indexes.json`
2. Despliega los índices: `firebase deploy --only firestore:indexes`
3. Espera a que el índice se construya (puede tardar minutos)
4. Verifica en Firebase Console que el índice esté en estado "Enabled"

