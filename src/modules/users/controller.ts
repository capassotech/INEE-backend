import { Request, Response } from 'express';
import { firestore, firebaseAuth } from '../../config/firebase';
import type { UserRegistrationData, UserProfile, SendAssignmentEmailParams } from '../../types/user';
import { normalizeText } from '../../utils/utils';
import { sendWelcomeEmail } from '../auth/controller';
import { sendResourceAvailableEmail } from '../emails/resourceAvailableEmail';

const sendAssignmentEmail = async (params: SendAssignmentEmailParams): Promise<void> => {
  await sendResourceAvailableEmail({
    userEmail: params.userEmail,
    userName: params.userName,
    resourceType: params.resourceType,
    resourceTitles: params.resourceTitles,
  });
};

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
        const searchNormalized = normalizeText(search!);
        users = users.filter((user: any) => {
          const nombre = normalizeText(user.nombre || '');
          const apellido = normalizeText(user.apellido || '');
          const email = normalizeText(user.email || '');
          const nombreCompleto = normalizeText(`${user.nombre || ''} ${user.apellido || ''}`);
          return nombre.includes(searchNormalized) || 
                 apellido.includes(searchNormalized) || 
                 email.includes(searchNormalized) ||
                 nombreCompleto.includes(searchNormalized);
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
};

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
    return res.status(400).json({ error: 'Debe proporcionar al menos un ID de formacion' });
  }

  const userDoc = await firestore.collection('users').doc(id_usuario).get();

  if (!userDoc.exists) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  // Validar que todos los formaciones existen
  const courseDocs = await Promise.all(
    idsCursos.map((id: string) => firestore.collection('courses').doc(id).get())
  );

  const cursosNoEncontrados = idsCursos.filter((id: string, index: number) => !courseDocs[index].exists);
  if (cursosNoEncontrados.length > 0) {
    return res.status(404).json({ 
      error: 'Una o más formaciones no encontradas',
      cursosNoEncontrados 
    });
  }

  // Obtener títulos de las formaciones para el email
  const titulosCursos = courseDocs.map(doc => doc.data()?.titulo || '').filter(Boolean);
  
  // Actualizar formaciones asignados sin duplicados
  const cursosAsignadosActuales = userDoc.data()?.cursos_asignados || [];
  const cursosNuevos = idsCursos.filter((id: string) => !cursosAsignadosActuales.includes(id));
  const cursosAsignadosActualizados = [...new Set([...cursosAsignadosActuales, ...idsCursos])];

  await userDoc.ref.update({ cursos_asignados: cursosAsignadosActualizados });

  // Enviar email usando la función auxiliar
  await sendAssignmentEmail({
    userEmail: userDoc.data()?.email || '',
    userName: userDoc.data()?.nombre || '',
    userLastName: userDoc.data()?.apellido || '',
    resourceType: 'curso',
    resourceTitles: titulosCursos,
  });

  const mensaje = cursosNuevos.length === idsCursos.length
    ? (idsCursos.length === 1 ? 'Formación asignada al usuario' : 'Formaciones asignados al usuario')
    : `${cursosNuevos.length} nueva(s) formacion(es) asignada(s), ${idsCursos.length - cursosNuevos.length} ya estaban asignados`;

  return res.status(200).json({ 
    message: mensaje,
    cursosAsignados: cursosNuevos,
    cursosYaAsignados: idsCursos.filter((id: string) => cursosAsignadosActuales.includes(id))
  });
}

export const desasignarCursoFromUser = async (req: any, res: Response) => {
  const { id_curso } = req.body;
  const id_usuario = req.params.id;

  const idsCursos = Array.isArray(id_curso) ? id_curso : [id_curso];

  if (!idsCursos.length) {
    return res.status(400).json({ error: 'Debe proporcionar al menos un ID de formacion' });
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
    ? (idsCursos.length === 1 ? 'Formacion desasignada del usuario' : 'Formaciones desasignados del usuario')
    : `${cursosDesasignados.length} formacion(es) desasignada(s), ${idsCursos.length - cursosDesasignados.length} no estaban asignadas`;

  return res.status(200).json({ 
    message: mensaje,
    cursosDesasignados,
    cursosNoAsignados: idsCursos.filter((id: string) => !cursosAsignados.includes(id))
  });
}

export const asignarEventoToUser = async (req: any, res: Response) => {
  const { id_evento } = req.body;
  const id_usuario = req.params.id;

  const idsEventos = Array.isArray(id_evento) ? id_evento : [id_evento];

  if (!idsEventos.length) {
    return res.status(400).json({ error: 'Debe proporcionar al menos un ID de evento' });
  }

  const userDoc = await firestore.collection('users').doc(id_usuario).get();

  if (!userDoc.exists) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  const eventDocs = await Promise.all(
    idsEventos.map((id: string) => firestore.collection('events').doc(id).get())
  );

  const eventosNoEncontrados = idsEventos.filter((id: string, index: number) => !eventDocs[index].exists);
  if (eventosNoEncontrados.length > 0) {
    return res.status(404).json({ 
      error: 'Uno o más eventos no encontrados',
      eventosNoEncontrados 
    });
  }

  const titulosEventos = eventDocs.map(doc => doc.data()?.titulo || '').filter(Boolean);
  
  const eventosAsignadosActuales = userDoc.data()?.eventos_asignados || [];
  const eventosNuevos = idsEventos.filter((id: string) => !eventosAsignadosActuales.includes(id));
  const eventosAsignadosActualizados = [...new Set([...eventosAsignadosActuales, ...idsEventos])];

  await userDoc.ref.update({ eventos_asignados: eventosAsignadosActualizados });

  await sendAssignmentEmail({
    userEmail: userDoc.data()?.email || '',
    userName: userDoc.data()?.nombre || '',
    userLastName: userDoc.data()?.apellido || '',
    resourceType: 'evento',
    resourceTitles: titulosEventos,
  });

  const mensaje = eventosNuevos.length === idsEventos.length
    ? (idsEventos.length === 1 ? 'Evento asignado al usuario' : 'Eventos asignados al usuario')
    : `${eventosNuevos.length} nuevo(s) evento(s) asignado(s), ${idsEventos.length - eventosNuevos.length} ya estaban asignados`;

  return res.status(200).json({ 
    message: mensaje,
    eventosAsignados: eventosNuevos,
    eventosYaAsignados: idsEventos.filter((id: string) => eventosAsignadosActuales.includes(id))
  });
}

export const desasignarEventoFromUser = async (req: any, res: Response) => {
  const { id_evento } = req.body;
  const id_usuario = req.params.id;

  const idsEventos = Array.isArray(id_evento) ? id_evento : [id_evento];

  if (!idsEventos.length) {
    return res.status(400).json({ error: 'Debe proporcionar al menos un ID de evento' });
  }

  const userDoc = await firestore.collection('users').doc(id_usuario).get();

  if (!userDoc.exists) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  const eventosAsignados = userDoc.data()?.eventos_asignados || [];
  const eventosActualizados = eventosAsignados.filter((eventoId: string) => !idsEventos.includes(eventoId));
  const eventosDesasignados = idsEventos.filter((id: string) => eventosAsignados.includes(id));

  await userDoc.ref.update({ eventos_asignados: eventosActualizados });
  
  const mensaje = eventosDesasignados.length === idsEventos.length
    ? (idsEventos.length === 1 ? 'Evento desasignado del usuario' : 'Eventos desasignados del usuario')
    : `${eventosDesasignados.length} evento(s) desasignado(s), ${idsEventos.length - eventosDesasignados.length} no estaban asignados`;

  return res.status(200).json({ 
    message: mensaje,
    eventosDesasignados,
    eventosNoAsignados: idsEventos.filter((id: string) => !eventosAsignados.includes(id))
  });
}

export const asignarEbookToUser = async (req: any, res: Response) => {
  const { id_ebook } = req.body;
  const id_usuario = req.params.id;

  const idsEbooks = Array.isArray(id_ebook) ? id_ebook : [id_ebook];

  if (!idsEbooks.length) {
    return res.status(400).json({ error: 'Debe proporcionar al menos un ID de ebook' });
  }

  const userDoc = await firestore.collection('users').doc(id_usuario).get();

  if (!userDoc.exists) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  const ebookDocs = await Promise.all(
    idsEbooks.map((id: string) => firestore.collection('ebooks').doc(id).get())
  );

  const ebooksNoEncontrados = idsEbooks.filter((id: string, index: number) => !ebookDocs[index].exists);
  if (ebooksNoEncontrados.length > 0) {
    return res.status(404).json({ 
      error: 'Uno o más ebooks no encontrados',
      ebooksNoEncontrados 
    });
  }

  const titulosEbooks = ebookDocs.map(doc => doc.data()?.title || '').filter(Boolean);
  
  const ebooksAsignadosActuales = userDoc.data()?.ebooks_asignados || [];
  const ebooksNuevos = idsEbooks.filter((id: string) => !ebooksAsignadosActuales.includes(id));
  const ebooksAsignadosActualizados = [...new Set([...ebooksAsignadosActuales, ...idsEbooks])];

  await userDoc.ref.update({ ebooks_asignados: ebooksAsignadosActualizados });

  await sendAssignmentEmail({
    userEmail: userDoc.data()?.email || '',
    userName: userDoc.data()?.nombre || '',
    userLastName: userDoc.data()?.apellido || '',
    resourceType: 'ebook',
    resourceTitles: titulosEbooks,
  });

  const mensaje = ebooksNuevos.length === idsEbooks.length
    ? (idsEbooks.length === 1 ? 'Ebook asignado al usuario' : 'Ebooks asignados al usuario')
    : `${ebooksNuevos.length} nuevo(s) ebook(s) asignado(s), ${idsEbooks.length - ebooksNuevos.length} ya estaban asignados`;

  return res.status(200).json({ 
    message: mensaje,
    ebooksAsignados: ebooksNuevos,
    ebooksYaAsignados: idsEbooks.filter((id: string) => ebooksAsignadosActuales.includes(id))
  });
}

export const desasignarEbookFromUser = async (req: any, res: Response) => {
  const { id_ebook } = req.body;
  const id_usuario = req.params.id;

  const idsEbooks = Array.isArray(id_ebook) ? id_ebook : [id_ebook];

  if (!idsEbooks.length) {
    return res.status(400).json({ error: 'Debe proporcionar al menos un ID de ebook' });
  }

  const userDoc = await firestore.collection('users').doc(id_usuario).get();

  if (!userDoc.exists) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  const ebooksAsignados = userDoc.data()?.ebooks_asignados || [];
  const ebooksActualizados = ebooksAsignados.filter((ebookId: string) => !idsEbooks.includes(ebookId));
  const ebooksDesasignados = idsEbooks.filter((id: string) => ebooksAsignados.includes(id));

  await userDoc.ref.update({ ebooks_asignados: ebooksActualizados });
  
  const mensaje = ebooksDesasignados.length === idsEbooks.length
    ? (idsEbooks.length === 1 ? 'Ebook desasignado del usuario' : 'Ebooks desasignados del usuario')
    : `${ebooksDesasignados.length} ebook(s) desasignado(s), ${idsEbooks.length - ebooksDesasignados.length} no estaban asignados`;

  return res.status(200).json({ 
    message: mensaje,
    ebooksDesasignados,
    ebooksNoAsignados: idsEbooks.filter((id: string) => !ebooksAsignados.includes(id))
  });
}

export const createUser = async (req: Request, res: Response) => {
  try {
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
      return res.status(400).json({
        error: 'Todos los campos son requeridos',
      });
    }

    // Verificar si el email ya existe en Firebase Auth
    try {
      await firebaseAuth.getUserByEmail(email);
      // Si llegamos aquí, el usuario ya existe
      return res.status(409).json({
        error: 'Ya existe un usuario registrado con este email',
      });
    } catch (error: any) {
      // Si el error es 'auth/user-not-found', el usuario no existe, continuar
      if (error.code !== 'auth/user-not-found') {
        console.error('Error verificando email:', error);
        throw error;
      }
    }

    // Verificar si el DNI ya existe
    const existingDniQuery = await firestore
      .collection('users')
      .where('dni', '==', dni)
      .get();

    if (!existingDniQuery.empty) {
      return res.status(409).json({
        error: 'Ya existe un usuario registrado con este DNI',
      });
    }

    // Crear usuario en Firebase Auth
    let userRecord;
    try {
      userRecord = await firebaseAuth.createUser({
        email,
        password,
        displayName: `${nombre} ${apellido}`,
        emailVerified: false,
        disabled: false,
      });
      
      // Verificar que el usuario tiene el proveedor de password habilitado
      const hasPasswordProvider = userRecord.providerData.some(p => p.providerId === 'password');
      if (!hasPasswordProvider) {
        // Intentar actualizar el usuario para asegurar que tenga el proveedor de password
        try {
          await firebaseAuth.updateUser(userRecord.uid, {
            password: password,
          });
        } catch (updateError: any) {
          console.error('Error actualizando usuario:', updateError);
        }
      }
    } catch (authError: any) {
      console.error('Error creando usuario en Firebase Auth:', authError.code, authError.message);
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
      eventos_asignados: [],
      ebooks_asignados: [],
    };

    try {
      await firestore.collection('users').doc(userRecord.uid).set(userProfile);
    } catch (firestoreError: any) {
      console.error('Error creando perfil en Firestore. Intentando eliminar usuario de Auth...', firestoreError);
      // Si falla la creación en Firestore, eliminar el usuario de Auth para mantener consistencia
      try {
        await firebaseAuth.deleteUser(userRecord.uid);
      } catch (deleteError: any) {
        console.error('Error eliminando usuario de Auth después de fallo en Firestore:', deleteError);
      }
      throw firestoreError;
    }

    // Verificar que el usuario puede hacer login haciendo un login de prueba
    // Esto asegura que las credenciales están correctamente configuradas en Firebase Auth
    try {
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
        console.error('Error verificando login:', loginResult.error?.message || loginResult.error);
      }
    } catch (loginTestError: any) {
      console.error('Error al verificar login:', loginTestError.message);
    }

    // Enviar email de bienvenida al usuario creado (no crítico si falla)
    try {
      await sendWelcomeEmail(userRecord.email || "", nombre);
    } catch (emailError: any) {
      console.error('Error enviando email de bienvenida:', emailError);
    }

    // Retornar el usuario creado con el formato esperado por el admin
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