# Guía Rápida: Crear Índices de Firestore

## Método Rápido: Firebase CLI

```bash
# 1. Instalar Firebase CLI (si no lo tienes)
npm install -g firebase-tools

# 2. Ir al directorio del backend
cd INEE-backend

# 3. Iniciar sesión
firebase login

# 4. Seleccionar proyecto (reemplaza TU_PROJECT_ID con tu ID de proyecto)
firebase use TU_PROJECT_ID

# 5. Desplegar índices
firebase deploy --only firestore:indexes
```

## Método Manual: Firebase Console

Si prefieres crear los índices manualmente:

1. **Abre Firebase Console**: https://console.firebase.google.com/
2. **Selecciona tu proyecto**
3. **Ve a**: Firestore Database → Índices
4. **Haz clic en**: "Agregar índice"
5. **Crea cada índice** según la lista de abajo

## Lista de Índices a Crear

### 1. Purchases - userId + paymentStatus
- **Colección**: `purchases`
- **Campo 1**: `userId` (ASCENDING)
- **Campo 2**: `paymentStatus` (ASCENDING)

### 2. Purchases - userId + courseId + paymentStatus
- **Colección**: `purchases`
- **Campo 1**: `userId` (ASCENDING)
- **Campo 2**: `courseId` (ASCENDING)
- **Campo 3**: `paymentStatus` (ASCENDING)

### 3. Purchases - userId + courseId
- **Colección**: `purchases`
- **Campo 1**: `userId` (ASCENDING)
- **Campo 2**: `courseId` (ASCENDING)

### 4. Reviews - courseId + createdAt
- **Colección**: `reviews`
- **Campo 1**: `courseId` (ASCENDING)
- **Campo 2**: `createdAt` (DESCENDING)

### 5. Reviews - userId + courseId
- **Colección**: `reviews`
- **Campo 1**: `userId` (ASCENDING)
- **Campo 2**: `courseId` (ASCENDING)

### 6. Review Reminders - userId + courseId
- **Colección**: `review_reminders`
- **Campo 1**: `userId` (ASCENDING)
- **Campo 2**: `courseId` (ASCENDING)

### 7. Users - email
- **Colección**: `users`
- **Campo 1**: `email` (ASCENDING)

### 8. Users - dni
- **Colección**: `users`
- **Campo 1**: `dni` (ASCENDING)

### 9. Courses - id_profesor + fechaCreacion
- **Colección**: `courses`
- **Campo 1**: `id_profesor` (ASCENDING)
- **Campo 2**: `fechaCreacion` (DESCENDING)

### 10. Courses - pilar + __name__
- **Colección**: `courses`
- **Campo 1**: `pilar` (ASCENDING)
- **Campo 2**: `__name__` (ASCENDING)

### 11. Courses - type + __name__
- **Colección**: `courses`
- **Campo 1**: `type` (ASCENDING)
- **Campo 2**: `__name__` (ASCENDING)

### 12. Courses - nivel + __name__
- **Colección**: `courses`
- **Campo 1**: `nivel` (ASCENDING)
- **Campo 2**: `__name__` (ASCENDING)

### 13. Suscripciones Email - email
- **Colección**: `suscripciones_email`
- **Campo 1**: `email` (ASCENDING)

## Verificar que los Índices se Crearon

1. Ve a Firebase Console → Firestore Database → Índices
2. Verifica que todos los índices aparezcan con estado **"Enabled"** (Habilitado)
3. Si algún índice está en estado **"Building"**, espera unos minutos

## Tiempo de Construcción

- **Índices simples** (1-2 campos): 1-5 minutos
- **Índices compuestos** (3+ campos): 5-15 minutos
- **Con muchos documentos**: Puede tardar más

Los índices se construyen en segundo plano, puedes seguir usando la aplicación mientras se crean.

