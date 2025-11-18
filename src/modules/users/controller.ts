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
    const limit = Math.min(parseInt(req.query.limit as string || '20'), 100); // Máximo 100
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
    
    console.log(`Found ${users.length} registered users (paginated)`);

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
  console.log('🔵 createUser llamado - Body:', JSON.stringify(req.body, null, 2));
  console.log('🔵 Headers:', req.headers);
  try {
    // El admin envía los datos en { user: {...} }, así que extraemos user o usamos el body directamente
    const userData: UserRegistrationData = req.body.user || req.body;
    console.log('🔵 userData extraído:', JSON.stringify(userData, null, 2));
    
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