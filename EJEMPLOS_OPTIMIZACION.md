# 📝 EJEMPLOS DE OPTIMIZACIÓN - INEE Backend

Este documento contiene ejemplos de código para implementar las optimizaciones críticas identificadas en la auditoría.

---

## 1. PAGINACIÓN EN CONSULTAS

### ❌ Código Actual (getUsers)

```typescript
// INEE-backend/src/modules/users/controller.ts
export const getUsers = async (req: any, res: Response) => {
  try {
    const userDocs = await firestore.collection('users').get();
    const users = userDocs.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    return res.json(users);
  } catch (error) {
    console.error('Error fetching registered users:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};
```

### ✅ Código Optimizado

```typescript
// INEE-backend/src/modules/users/controller.ts
export const getUsers = async (req: any, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '20'), 100); // Máximo 100
    const lastId = req.query.lastId as string | undefined;
    
    let query = firestore.collection('users')
      .orderBy('__name__') // Ordenar por ID del documento
      .limit(limit);
    
    // Si hay un lastId, continuar desde ahí
    if (lastId) {
      const lastDoc = await firestore.collection('users').doc(lastId).get();
      if (lastDoc.exists) {
        query = query.startAfter(lastDoc);
      }
    }
    
    const snapshot = await query.get();
    const users = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    const lastDoc = snapshot.docs[snapshot.docs.length - 1];
    const hasMore = snapshot.docs.length === limit;
    
    return res.json({
      users,
      pagination: {
        hasMore,
        lastId: lastDoc?.id,
        limit,
        count: users.length
      }
    });
  } catch (error) {
    console.error('Error fetching registered users:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};
```

### Uso en Frontend:

```typescript
// Ejemplo de uso con paginación
const [users, setUsers] = useState([]);
const [lastId, setLastId] = useState<string | undefined>();
const [hasMore, setHasMore] = useState(true);

const loadMore = async () => {
  const params = new URLSearchParams({
    limit: '20',
    ...(lastId && { lastId })
  });
  
  const response = await fetch(`/api/users?${params}`);
  const data = await response.json();
  
  setUsers([...users, ...data.users]);
  setLastId(data.pagination.lastId);
  setHasMore(data.pagination.hasMore);
};
```

---

## 2. OPTIMIZAR CONSULTAS N+1

### ❌ Código Actual (getUserCourses)

```typescript
// INEE-backend/src/modules/courses/controller.ts
export const getUserCourses = async (req: Request, res: Response) => {
  try { 
    const { id } = req.params;
    const doc = await firestore.collection('users').doc(id).get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    const courses = doc.data()?.cursos_asignados || [];
    // ❌ PROBLEMA: N consultas individuales
    const coursesData = await Promise.all(courses.map(async (courseId: string) => {
      const courseDoc = await collection.doc(courseId).get();
      return { id: courseDoc.id, ...courseDoc.data() };
    }));

    return res.json(coursesData);
  } catch (err) {
    console.error("getUserCourses error:", err);
    return res.status(500).json({ error: "Error al obtener cursos del usuario" });
  }
};
```

### ✅ Código Optimizado

```typescript
// INEE-backend/src/modules/courses/controller.ts
export const getUserCourses = async (req: Request, res: Response) => {
  try { 
    const { id } = req.params;
    const doc = await firestore.collection('users').doc(id).get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    const courseIds = doc.data()?.cursos_asignados || [];
    
    if (courseIds.length === 0) {
      return res.json([]);
    }
    
    // ✅ OPTIMIZACIÓN: Batch read con getAll()
    // Firestore Admin SDK permite leer múltiples documentos en una sola operación
    const courseRefs = courseIds.map((courseId: string) => 
      firestore.collection('courses').doc(courseId)
    );
    
    const courseDocs = await firestore.getAll(...courseRefs);
    
    const coursesData = courseDocs
      .filter(doc => doc.exists) // Filtrar documentos que no existen
      .map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

    return res.json(coursesData);
  } catch (err) {
    console.error("getUserCourses error:", err);
    return res.status(500).json({ error: "Error al obtener cursos del usuario" });
  }
};
```

**Nota:** `getAll()` puede leer hasta 10 documentos a la vez. Si hay más, dividir en batches:

```typescript
// Si hay más de 10 cursos, dividir en batches
const BATCH_SIZE = 10;
const batches = [];

for (let i = 0; i < courseIds.length; i += BATCH_SIZE) {
  const batch = courseIds.slice(i, i + BATCH_SIZE);
  const refs = batch.map(id => firestore.collection('courses').doc(id));
  batches.push(firestore.getAll(...refs));
}

const allDocs = await Promise.all(batches);
const coursesData = allDocs
  .flat()
  .filter(doc => doc.exists)
  .map(doc => ({ id: doc.id, ...doc.data() }));
```

---

## 3. PAGINACIÓN CON FILTROS

### ✅ Ejemplo: getAllCourses con Paginación y Filtros

```typescript
// INEE-backend/src/modules/courses/controller.ts
export const getAllCourses = async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string || '20'), 100);
    const lastId = req.query.lastId as string | undefined;
    const id_profesor = req.query.id_profesor as string | undefined;
    const tipo = req.query.tipo as string | undefined;
    
    let query: FirebaseFirestore.Query = collection;
    
    // Aplicar filtros
    if (id_profesor) {
      query = query.where('id_profesor', '==', id_profesor);
    }
    
    if (tipo) {
      query = query.where('type', '==', tipo);
    }
    
    // Ordenar y limitar
    query = query.orderBy('__name__').limit(limit);
    
    // Paginación
    if (lastId) {
      const lastDoc = await collection.doc(lastId).get();
      if (lastDoc.exists) {
        query = query.startAfter(lastDoc);
      }
    }
    
    const snapshot = await query.get();
    
    if (snapshot.empty) {
      return res.json({
        courses: [],
        pagination: {
          hasMore: false,
          lastId: null,
          limit,
          count: 0
        }
      });
    }

    const courses = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    
    const lastDoc = snapshot.docs[snapshot.docs.length - 1];
    const hasMore = snapshot.docs.length === limit;

    return res.json({
      courses,
      pagination: {
        hasMore,
        lastId: lastDoc?.id,
        limit,
        count: courses.length
      }
    });
  } catch (err) {
    console.error("getAllCourses error:", err);
    return res.status(500).json({ error: "Error al obtener cursos" });
  }
};
```

---

## 4. IMPLEMENTAR CACHÉ

### Instalación:

```bash
npm install ioredis
npm install --save-dev @types/ioredis
```

### Crear utilidad de caché:

```typescript
// INEE-backend/src/utils/cache.ts
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export const cache = {
  get: async <T>(key: string): Promise<T | null> => {
    try {
      const data = await redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  },
  
  set: async (key: string, value: any, ttl = 3600): Promise<void> => {
    try {
      await redis.setex(key, ttl, JSON.stringify(value));
    } catch (error) {
      console.error('Cache set error:', error);
    }
  },
  
  del: async (key: string): Promise<void> => {
    try {
      await redis.del(key);
    } catch (error) {
      console.error('Cache del error:', error);
    }
  },
  
  invalidatePattern: async (pattern: string): Promise<void> => {
    try {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch (error) {
      console.error('Cache invalidatePattern error:', error);
    }
  }
};
```

### Usar en controladores:

```typescript
// INEE-backend/src/modules/courses/controller.ts
import { cache } from '../../utils/cache';

export const getAllCourses = async (req: Request, res: Response) => {
  try {
    const cacheKey = `courses:all:${req.query.limit || 20}:${req.query.lastId || 'first'}`;
    
    // Intentar obtener del caché
    const cached = await cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }
    
    // Si no está en caché, consultar Firestore
    const limit = Math.min(parseInt(req.query.limit as string || '20'), 100);
    const lastId = req.query.lastId as string | undefined;
    
    let query = collection.orderBy('__name__').limit(limit);
    
    if (lastId) {
      const lastDoc = await collection.doc(lastId).get();
      if (lastDoc.exists) {
        query = query.startAfter(lastDoc);
      }
    }
    
    const snapshot = await query.get();
    const courses = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    
    const lastDoc = snapshot.docs[snapshot.docs.length - 1];
    const hasMore = snapshot.docs.length === limit;
    
    const result = {
      courses,
      pagination: {
        hasMore,
        lastId: lastDoc?.id,
        limit,
        count: courses.length
      }
    };
    
    // Guardar en caché por 5 minutos
    await cache.set(cacheKey, result, 300);
    
    return res.json(result);
  } catch (err) {
    console.error("getAllCourses error:", err);
    return res.status(500).json({ error: "Error al obtener cursos" });
  }
};

// Invalidar caché al crear/actualizar/eliminar
export const createCourse = async (req: AuthenticatedRequest, res: Response) => {
  // ... lógica de creación ...
  
  // Invalidar caché de cursos
  await cache.invalidatePattern('courses:*');
  
  return res.status(201).json({ /* ... */ });
};
```

---

## 5. RATE LIMITING

### Instalación:

```bash
npm install express-rate-limit
```

### Implementación:

```typescript
// INEE-backend/src/middleware/rateLimiter.ts
import rateLimit from 'express-rate-limit';

// Rate limiter general
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // 100 requests por ventana
  message: 'Demasiadas solicitudes desde esta IP, intenta de nuevo más tarde.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter estricto para autenticación
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // 5 intentos de login por ventana
  message: 'Demasiados intentos de login, intenta de nuevo más tarde.',
  skipSuccessfulRequests: true,
});

// Rate limiter para endpoints pesados
export const heavyLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 10, // 10 requests por minuto
  message: 'Demasiadas solicitudes, intenta de nuevo más tarde.',
});
```

### Usar en rutas:

```typescript
// INEE-backend/src/index.ts
import { generalLimiter, authLimiter } from './middleware/rateLimiter';

app.use('/api/', generalLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
```

---

## 6. VALIDACIÓN CON ZOD

### Instalación:

```bash
npm install zod
```

### Ejemplo de validación:

```typescript
// INEE-backend/src/schemas/course.schema.ts
import { z } from 'zod';

export const createCourseSchema = z.object({
  titulo: z.string().min(3).max(200),
  descripcion: z.string().min(10).max(5000),
  precio: z.number().positive(),
  id_profesor: z.string().min(1),
  id_modulos: z.array(z.string()).optional(),
  type: z.enum(['ON_DEMAND', 'ASYNC', 'VIVO', 'MEMBERSHIP']),
});

export const updateCourseSchema = createCourseSchema.partial();

export const paginationSchema = z.object({
  limit: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().min(1).max(100)).optional(),
  lastId: z.string().optional(),
});
```

### Usar en controladores:

```typescript
// INEE-backend/src/modules/courses/controller.ts
import { createCourseSchema, paginationSchema } from '../../schemas/course.schema';

export const getAllCourses = async (req: Request, res: Response) => {
  try {
    // Validar query parameters
    const pagination = paginationSchema.parse(req.query);
    
    const limit = pagination.limit || 20;
    // ... resto del código
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Parámetros inválidos', details: err.errors });
    }
    // ... manejo de otros errores
  }
};

export const createCourse = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Validar body
    const courseData = createCourseSchema.parse(req.body);
    // ... resto del código
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Datos inválidos', details: err.errors });
    }
    // ... manejo de otros errores
  }
};
```

---

## 7. DESPLEGAR ÍNDICES DE FIRESTORE

### Crear archivo de configuración:

Ya está creado: `INEE-backend/firestore.indexes.json`

### Desplegar índices:

```bash
# Desde la raíz del proyecto backend
cd INEE-backend

# Si no tienes Firebase CLI instalado
npm install -g firebase-tools

# Login en Firebase
firebase login

# Inicializar Firebase (si no está inicializado)
firebase init firestore

# Desplegar índices
firebase deploy --only firestore:indexes
```

### Verificar índices:

1. Ir a Firebase Console
2. Firestore Database → Indexes
3. Verificar que todos los índices estén creados

---

## 📋 CHECKLIST DE IMPLEMENTACIÓN

- [ ] Implementar paginación en `getUsers`
- [ ] Implementar paginación en `getAllCourses`
- [ ] Implementar paginación en `getAllEvents`
- [ ] Implementar paginación en `getAllEbooks`
- [ ] Optimizar `getUserCourses` (eliminar N+1)
- [ ] Crear y desplegar `firestore.indexes.json`
- [ ] Implementar caché con Redis
- [ ] Implementar rate limiting
- [ ] Agregar validación con Zod
- [ ] Mover API keys a variables de entorno
- [ ] Implementar monitoreo y logging

---

**Nota:** Estos son ejemplos de implementación. Ajusta según las necesidades específicas de tu proyecto.

