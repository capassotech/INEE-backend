import { Request, Response } from 'express';
import { firestore, firebaseAuth } from '../../config/firebase';
import type { UserRegistrationData, UserProfile } from '../../types/user';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export const getUserProfile = async (req: any, res: Response) => {
  const uid = req.user.uid;
  const userDoc = await firestore.collection('users').doc(uid).get();

  if (!userDoc.exists) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  return res.json(userDoc.data());
};

// MEMBRESÍAS DESACTIVADAS - Comentado para posible reactivación futura
// Agregarle membresia al usuario
/* export const addMembershipToUser = async (req: any, res: Response) => {
  const { uid, membershipId } = req.body;
  const userDoc = await firestore.collection('users').doc(uid).get();
  const membershipDoc = await firestore.collection('membresias').doc(membershipId).get();
  if (!userDoc.exists) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  if (!membershipDoc.exists && membershipId !== "none") {
    return res.status(404).json({ error: 'Membresía no encontrada' });
  }

  if (membershipId === "none") await userDoc.ref.update({ membresia: "" });
  else await userDoc.ref.update({ membresia: membershipId });

  return res.status(200).json({ message: 'Membresía agregada al usuario' });
} */

export const getUser = async (req: any, res: Response) => {
  const uid = req.params.id;
  const userDoc = await firestore.collection('users').doc(uid).get();

  if (!userDoc.exists) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  return res.json(userDoc.data());
};

export const getUsers = async (req: any, res: Response) => {
  try {
    const rawLimit = parseInt((req.query.limit as string) || (req.query.pageSize as string) || '20', 10);
    const limit = Math.min(Number.isNaN(rawLimit) ? 20 : rawLimit, 100); 
    const pageQuery = req.query.page as string | undefined;
    const page = Math.max(parseInt(pageQuery || '1', 10) || 1, 1);
    const offset = (page - 1) * limit;
    const search = req.query.search as string | undefined; 
    const status = req.query.status as string | undefined;
    const sortBy = req.query.sortBy as string | undefined;
    
    const hasSearch = Boolean(search && search.trim());
    const hasStatusFilter = Boolean(status && status !== 'all');
    const hasSort = Boolean(sortBy);
    const hasFilters = hasSearch || hasStatusFilter || hasSort;
    
    let users: any[] = [];
    let totalFiltered = 0;
    
    if (!hasFilters) {
      try {
        const countSnapshot = await firestore.collection('users').count().get();
        totalFiltered = countSnapshot.data().count;
      } catch (error) {
        const allUsersSnapshot = await firestore.collection('users').get();
        totalFiltered = allUsersSnapshot.size;
      }
      
      const pageQuery = firestore.collection('users')
        .orderBy('__name__')
        .offset(offset)
        .limit(limit);
      const pageSnapshot = await pageQuery.get();
      users = pageSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } else {
      const queryLimit = Math.min(limit * 10, 1000);
      
      let query = firestore.collection('users').orderBy('__name__').limit(queryLimit);
      const snapshot = await query.get();

      users = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    
      if (hasSearch) {
        const searchLower = search!.toLowerCase().trim();
        users = users.filter((user: any) => {
          const nombre = (user.nombre || '').toLowerCase();
          const apellido = (user.apellido || '').toLowerCase();
          const email = (user.email || '').toLowerCase();
          const nombreCompleto = `${nombre} ${apellido}`.toLowerCase();
          return nombre.includes(searchLower) || 
                 apellido.includes(searchLower) || 
                 email.includes(searchLower) ||
                 nombreCompleto.includes(searchLower);
        });
      }
      
      if (hasStatusFilter) {
        const isActive = status === 'activo';
        users = users.filter((user: any) => user.activo === isActive);
      }

      if (hasSort) {
        switch (sortBy) {
          case 'name':
            users.sort((a: any, b: any) => {
              const nameA = `${a.nombre || ''} ${a.apellido || ''}`.toLowerCase();
              const nameB = `${b.nombre || ''} ${b.apellido || ''}`.toLowerCase();
              return nameA.localeCompare(nameB);
            });
            break;
          case 'date':
            users.sort((a: any, b: any) => {
              const dateA = a.fechaRegistro?._seconds ? new Date(a.fechaRegistro._seconds * 1000).getTime() : 0;
              const dateB = b.fechaRegistro?._seconds ? new Date(b.fechaRegistro._seconds * 1000).getTime() : 0;
              return dateB - dateA;
            });
            break;
          case 'totalSpent':
            users.sort((a: any, b: any) => {
              const totalA = a.totalInvertido || 0;
              const totalB = b.totalInvertido || 0;
              return totalB - totalA;
            });
            break;
        }
      }
      
      totalFiltered = users.length;
      
      users = users.slice(offset, offset + limit);
    }
    
    const totalPages = totalFiltered > 0 ? Math.ceil(totalFiltered / limit) : 1;
    
    const hasMore = offset + limit < totalFiltered;
    
    return res.json({
      users,
      pagination: {
        hasMore,
        lastId: null,
        limit,
        page,
        nextPage: hasMore ? page + 1 : undefined,
        total: totalFiltered,
        totalPages,
        count: users.length
      }
    });
  } catch (error) {
    console.error('Error fetching registered users:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

export const deleteUser = async (req: any, res: Response) => {
  try {
    const uid = req.params.id;
    const userDoc = await firestore.collection('users').doc(uid).get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    await userDoc.ref.delete();

    return res.status(200).json({
      message: 'Usuario eliminado correctamente'
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

export const updateUser = async (req: any, res: Response) => {
  try {
    const uid = req.params.id;
    const userDoc = await firestore.collection('users').doc(uid).get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // Preparar datos de actualización
    const updateData: any = {
      fechaActualizacion: new Date(),
    };

    // Procesar todos los campos del body, incluyendo activo
    const bodyData = req.body;
    
    // Si el frontend envía los datos dentro de un objeto 'user', extraerlos
    const datosUsuario = bodyData.user || bodyData;

    // Copiar todos los campos válidos al updateData
    // Excluir campos que no deben actualizarse directamente
    const camposExcluidos = ['id', 'uid', 'fechaRegistro', 'email', 'fechaActualizacion'];
    
    for (const [key, value] of Object.entries(datosUsuario)) {
      // No incluir campos excluidos
      if (camposExcluidos.includes(key)) {
        continue;
      }
      
      // Incluir el campo si tiene un valor válido (incluyendo false y 0)
      if (value !== undefined && value !== null) {
        // Validar que activo sea booleano
        if (key === 'activo') {
          if (typeof value === 'boolean') {
            updateData.activo = value;
          } else if (value === 'true' || value === true) {
            updateData.activo = true;
          } else if (value === 'false' || value === false) {
            updateData.activo = false;
          } else {
            console.warn(`[updateUser] Valor inválido para activo: ${value}, tipo: ${typeof value}`);
          }
        } else {
          // No copiar objetos de Firestore directamente (tienen _seconds, _nanoseconds)
          if (typeof value === 'object' && value !== null && ('_seconds' in value || '_nanoseconds' in value)) {
            continue;
          }
          updateData[key] = value;
        }
      }
    }
    
    // Asegurar que fechaActualizacion siempre sea un Date nuevo
    updateData.fechaActualizacion = new Date();

    // Actualizar en Firestore
    await userDoc.ref.update(updateData);

    // Obtener documento actualizado
    const updatedDoc = await firestore.collection('users').doc(uid).get();
    const updatedData = updatedDoc.data();

    return res.status(200).json({
      message: 'Usuario actualizado correctamente',
      user: {
        id: updatedDoc.id,
        ...updatedData,
        fechaRegistro: updatedData?.fechaRegistro?.toDate?.() || updatedData?.fechaRegistro,
        fechaActualizacion: updatedData?.fechaActualizacion?.toDate?.() || updatedData?.fechaActualizacion,
        fechaEliminacion: updatedData?.fechaEliminacion?.toDate?.() || updatedData?.fechaEliminacion,
      }
    });
  } catch (error) {
    console.error('Error updating user:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

export const asignCourseToUser = async (req: any, res: Response) => {
  const { id_curso } = req.body;
  const id_usuario = req.params.id;

  // Normalizar id_curso a un array
  const idsCursos = Array.isArray(id_curso) ? id_curso : [id_curso];

  if (!idsCursos.length) {
    return res.status(400).json({ error: 'Debe proporcionar al menos un ID de curso' });
  }

  const userDoc = await firestore.collection('users').doc(id_usuario).get();

  if (!userDoc.exists) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  // Validar que todos los cursos existen
  const courseDocs = await Promise.all(
    idsCursos.map((id: string) => firestore.collection('courses').doc(id).get())
  );

  const cursosNoEncontrados = idsCursos.filter((id: string, index: number) => !courseDocs[index].exists);
  if (cursosNoEncontrados.length > 0) {
    return res.status(404).json({ 
      error: 'Uno o más cursos no encontrados',
      cursosNoEncontrados 
    });
  }

  // Obtener títulos de los cursos para el email
  const titulosCursos = courseDocs.map(doc => doc.data()?.titulo || '').filter(Boolean);
  
  // Actualizar cursos asignados sin duplicados
  const cursosAsignadosActuales = userDoc.data()?.cursos_asignados || [];
  const cursosNuevos = idsCursos.filter((id: string) => !cursosAsignadosActuales.includes(id));
  const cursosAsignadosActualizados = [...new Set([...cursosAsignadosActuales, ...idsCursos])];

  await userDoc.ref.update({ cursos_asignados: cursosAsignadosActualizados });

  // Enviar email con información de los cursos asignados
  const mensajeCursos = titulosCursos.length === 1 
    ? `el curso ${titulosCursos[0]}`
    : `los siguientes cursos: ${titulosCursos.join(', ')}`;

  const { data, error } = await resend.emails.send({
    from: "INEE Oficial <contacto@ineeoficial.com>",
    to: userDoc.data()?.email || '',
    subject: titulosCursos.length === 1 ? 'Curso asignado' : 'Cursos asignados',
    html: `<p>Hola ${userDoc.data()?.nombre || ''} ${userDoc.data()?.apellido || ''}! Te informamos que has sido asignado a ${mensajeCursos} en INEE.</p>`,
  });

  if (error) {
    console.error('Error al enviar email:', error);
    // No retornar error aquí, ya se asignaron los cursos
  }

  const mensaje = cursosNuevos.length === idsCursos.length
    ? (idsCursos.length === 1 ? 'Curso asignado al usuario' : 'Cursos asignados al usuario')
    : `${cursosNuevos.length} nuevo(s) curso(s) asignado(s), ${idsCursos.length - cursosNuevos.length} ya estaban asignados`;

  return res.status(200).json({ 
    message: mensaje,
    cursosAsignados: cursosNuevos,
    cursosYaAsignados: idsCursos.filter((id: string) => cursosAsignadosActuales.includes(id))
  });
}

export const desasignarCursoFromUser = async (req: any, res: Response) => {
  const { id_curso } = req.body;
  const id_usuario = req.params.id;

  // Normalizar id_curso a un array
  const idsCursos = Array.isArray(id_curso) ? id_curso : [id_curso];

  if (!idsCursos.length) {
    return res.status(400).json({ error: 'Debe proporcionar al menos un ID de curso' });
  }

  const userDoc = await firestore.collection('users').doc(id_usuario).get();

  if (!userDoc.exists) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  const cursosAsignados = userDoc.data()?.cursos_asignados || [];
  const cursosActualizados = cursosAsignados.filter((cursoId: string) => !idsCursos.includes(cursoId));
  const cursosDesasignados = idsCursos.filter((id: string) => cursosAsignados.includes(id));

  await userDoc.ref.update({ cursos_asignados: cursosActualizados });
  
  const mensaje = cursosDesasignados.length === idsCursos.length
    ? (idsCursos.length === 1 ? 'Curso desasignado del usuario' : 'Cursos desasignados del usuario')
    : `${cursosDesasignados.length} curso(s) desasignado(s), ${idsCursos.length - cursosDesasignados.length} no estaban asignados`;

  return res.status(200).json({ 
    message: mensaje,
    cursosDesasignados,
    cursosNoAsignados: idsCursos.filter((id: string) => !cursosAsignados.includes(id))
  });
}

export const createUser = async (req: Request, res: Response) => {
  try {
    console.log(`[createUser] ========== INICIO CREACIÓN DE USUARIO ==========`);
    console.log(`[createUser] Body recibido:`, JSON.stringify(req.body, null, 2));
    
    // El admin envía los datos en { user: {...} }, así que extraemos user o usamos el body directamente
    const userData: UserRegistrationData = req.body.user || req.body;
    
    let {
      email,
      password,
      nombre,
      apellido,
      dni,
      aceptaTerminos,
    } = userData;

    // Normalizar email: trim y lowercase para consistencia
    if (email) {
      email = email.trim().toLowerCase();
    }

    // Validaciones básicas
    if (!email || !password || !nombre || !apellido || !dni) {
      console.error('[createUser] Error de validación: campos faltantes');
      console.error('[createUser] Campos recibidos:', { email: !!email, password: !!password, nombre: !!nombre, apellido: !!apellido, dni: !!dni });
      return res.status(400).json({
        error: 'Todos los campos son requeridos',
      });
    }

    // Verificar si el email ya existe en Firebase Auth
    try {
      console.log(`[createUser] Verificando si el email ya existe en Firebase Auth...`);
      await firebaseAuth.getUserByEmail(email);
      // Si llegamos aquí, el usuario ya existe
      console.log(`[createUser] El email ya existe en Firebase Auth`);
      return res.status(409).json({
        error: 'Ya existe un usuario registrado con este email',
      });
    } catch (error: any) {
      // Si el error es 'auth/user-not-found', el usuario no existe, continuar
      if (error.code !== 'auth/user-not-found') {
        console.error('[createUser] Error verificando email:', error);
        throw error;
      }
      console.log(`[createUser] Email no existe en Firebase Auth, continuando con la creación...`);
    }

    // Verificar si el DNI ya existe
    console.log(`[createUser] Verificando si el DNI ya existe en Firestore...`);
    const existingDniQuery = await firestore
      .collection('users')
      .where('dni', '==', dni)
      .get();

    if (!existingDniQuery.empty) {
      console.log(`[createUser] El DNI ya existe en Firestore`);
      return res.status(409).json({
        error: 'Ya existe un usuario registrado con este DNI',
      });
    }
    console.log(`[createUser] DNI no existe en Firestore, continuando...`);

    // Crear usuario en Firebase Auth
    let userRecord;
    try {
      console.log(`[createUser] Creando usuario en Firebase Auth con email: ${email}`);
      userRecord = await firebaseAuth.createUser({
        email,
        password,
        displayName: `${nombre} ${apellido}`,
        emailVerified: false,
        disabled: false,
      });
      console.log(`[createUser] Usuario creado en Firebase Auth exitosamente. UID: ${userRecord.uid}`);
    } catch (authError: any) {
      console.error('[createUser] Error creando usuario en Firebase Auth:', authError.code, authError.message);
      throw authError;
    }

    // Crear perfil de usuario en Firestore
    const userProfile: Omit<UserProfile, 'uid'> = {
      email,
      nombre,
      apellido,
      dni,
      role: 'alumno',
      fechaRegistro: new Date(),
      fechaActualizacion: new Date(),
      aceptaTerminos: aceptaTerminos || false,
      activo: true,
      cursos_asignados: [],
    };

    try {
      console.log(`[createUser] Guardando perfil de usuario en Firestore. UID: ${userRecord.uid}`);
      console.log(`[createUser] Datos del perfil:`, JSON.stringify(userProfile, null, 2));
      
      await firestore.collection('users').doc(userRecord.uid).set(userProfile);
      
      console.log(`[createUser] Perfil de usuario guardado exitosamente en Firestore`);
      
      // Verificar que el documento se guardó correctamente
      const savedDoc = await firestore.collection('users').doc(userRecord.uid).get();
      if (!savedDoc.exists) {
        throw new Error('El documento no existe después de guardarlo');
      }
      console.log(`[createUser] Verificación: documento existe en Firestore`);
    } catch (firestoreError: any) {
      console.error('[createUser] Error creando perfil en Firestore:', firestoreError);
      console.error('[createUser] Código de error:', firestoreError.code);
      console.error('[createUser] Mensaje:', firestoreError.message);
      
      // Si falla la creación en Firestore, eliminar el usuario de Auth para mantener consistencia
      try {
        console.log(`[createUser] Intentando eliminar usuario de Auth debido a fallo en Firestore...`);
        await firebaseAuth.deleteUser(userRecord.uid);
        console.log(`[createUser] Usuario eliminado de Auth exitosamente`);
      } catch (deleteError: any) {
        console.error('[createUser] Error eliminando usuario de Auth después de fallo en Firestore:', deleteError);
      }
      throw firestoreError;
    }

    // Verificar que el login funciona correctamente con las credenciales recién creadas
    try {
      console.log(`[createUser] Verificando que el login funciona con las credenciales creadas...`);
      const firebaseApiKey = "AIzaSyAZDT5DM68-9qYH23HdKAsOTaV_qCAPEiw";
      const loginResponse = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseApiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: email,
            password: password,
            returnSecureToken: true,
          }),
        }
      );

      const loginResult = await loginResponse.json();

      if (!loginResponse.ok) {
        console.error('[createUser] ❌ Error verificando login:', loginResult.error?.message || loginResult.error);
        console.error('[createUser] El usuario fue creado pero no puede hacer login. Verificar configuración de Firebase Auth.');
      } else {
        console.log(`[createUser] ✅ Login verificado exitosamente. El usuario puede ingresar con sus credenciales.`);
      }
    } catch (loginTestError: any) {
      console.error('[createUser] Error al verificar login:', loginTestError.message);
    }

    try {
      console.log(`[createUser] Enviando email de bienvenida a: ${userRecord.email}`);
      await resend.emails.send({
        from: "INEE Oficial <contacto@ineeoficial.com>",
        to: userRecord.email || "",
        subject: "Bienvenido a INEE",
        html: `<p>Bienvenido a INEE ${nombre} ${apellido}! Te informamos que has sido registrado en INEE.</p>`,
      });
      console.log(`[createUser] Email de bienvenida enviado exitosamente`);
    } catch (emailError: any) {
      console.error('[createUser] Error enviando email de bienvenida:', emailError);
      // No lanzar error aquí, el usuario ya fue creado exitosamente
    }

    // Retornar el usuario creado con el formato esperado por el admin
    console.log(`[createUser] ✅ Usuario creado exitosamente. UID: ${userRecord.uid}, Email: ${email}`);
    return res.status(201).json({
      id: userRecord.uid,
      ...userProfile,
    });
  } catch (error: any) {
    console.error('Error en createUser:', error);

    // Manejar errores específicos de Firebase Auth
    if (error.code === 'auth/email-already-exists') {
      return res.status(409).json({
        error: 'Ya existe un usuario registrado con este email',
      });
    }

    if (error.code === 'auth/invalid-email') {
      return res.status(400).json({
        error: 'Formato de email inválido',
      });
    }

    if (error.code === 'auth/weak-password') {
      return res.status(400).json({
        error: 'La contraseña es muy débil',
      });
    }

    if (error.code === 'auth/operation-not-allowed') {
      return res.status(500).json({
        error: 'Operación no permitida. Verifique la configuración de Firebase Auth',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }

    if (error.code === 'auth/invalid-credential') {
      return res.status(400).json({
        error: 'Credenciales inválidas',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }

    // Errores de Firestore
    if (error.code === 'permission-denied') {
      return res.status(500).json({
        error: 'Error de permisos en la base de datos',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }

    return res.status(500).json({
      error: 'Error interno del servidor',
      details:
        process.env.NODE_ENV === 'development' 
          ? { message: error.message, code: error.code, stack: error.stack }
          : undefined,
    });
  }
};