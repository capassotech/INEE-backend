import { Request, Response } from 'express';
import { firestore, firebaseAuth } from '../../config/firebase';
import type { UserRegistrationData, UserProfile } from '../../types/user';

export const getUserProfile = async (req: any, res: Response) => {
  const uid = req.user.uid;
  const userDoc = await firestore.collection('users').doc(uid).get();

  if (!userDoc.exists) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  return res.json(userDoc.data());
};

// Agregarle membresia al usuario
export const addMembershipToUser = async (req: any, res: Response) => {
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
}

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

    await userDoc.ref.update(req.body);

    const updatedDoc = await firestore.collection('users').doc(uid).get();

    return res.status(200).json({
      message: 'Usuario actualizado correctamente',
      user: {
        id: updatedDoc.id,
        ...updatedDoc.data()
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

  const userDoc = await firestore.collection('users').doc(id_usuario).get();
  const courseDoc = await firestore.collection('courses').doc(id_curso).get();

  if (!userDoc.exists) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }
  if (!courseDoc.exists) {
    return res.status(404).json({ error: 'Curso no encontrado' });
  }

  await userDoc.ref.update({ cursos_asignados: [...userDoc.data()?.cursos_asignados || [], id_curso] });
  return res.status(200).json({ message: 'Curso asignado al usuario' });
}

export const desasignarCursoFromUser = async (req: any, res: Response) => {
  const { id_curso } = req.body;
  const id_usuario = req.params.id;

  const userDoc = await firestore.collection('users').doc(id_usuario).get();

  if (!userDoc.exists) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  const cursosAsignados = userDoc.data()?.cursos_asignados || [];
  const cursosActualizados = cursosAsignados.filter((cursoId: string) => cursoId !== id_curso);

  await userDoc.ref.update({ cursos_asignados: cursosActualizados });
  return res.status(200).json({ message: 'Curso desasignado del usuario' });
}

export const createUser = async (req: Request, res: Response) => {
  try {
    // El admin envía los datos en { user: {...} }, así que extraemos user o usamos el body directamente
    const userData: UserRegistrationData = req.body.user || req.body;
    
    const {
      email,
      password,
      nombre,
      apellido,
      dni,
      aceptaTerminos,
    } = userData;

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
    const userRecord = await firebaseAuth.createUser({
      email,
      password,
      displayName: `${nombre} ${apellido}`,
    });

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

    await firestore.collection('users').doc(userRecord.uid).set(userProfile);

    // Retornar el usuario creado con el formato esperado por el admin
    return res.status(201).json({
      id: userRecord.uid,
      ...userProfile,
    });
  } catch (error: any) {
    console.error('Error en createUser:', error);

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

    return res.status(500).json({
      error: 'Error interno del servidor',
      details:
        process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};