import type { Request, Response } from "express";
import { firebaseAuth, firestore } from "../../config/firebase";
import type { UserRegistrationData, UserProfile } from "../../types/user";
import type { AuthenticatedRequest } from "../../middleware/authMiddleware";

export const registerUser = async (req: Request, res: Response) => {
  try {
    const {
      email,
      password,
      nombre,
      apellido,
      dni,
      aceptaTerminos,
    }: UserRegistrationData = req.body;

    // Verificar si el DNI ya existe
    const existingDniQuery = await firestore
      .collection("users")
      .where("dni", "==", dni)
      .get();

    if (!existingDniQuery.empty) {
      return res.status(409).json({
        error: "Ya existe un usuario registrado con este DNI",
      });
    }

    // Crear usuario en Firebase Auth
    const userRecord = await firebaseAuth.createUser({
      email,
      password,
      displayName: `${nombre} ${apellido}`,
    });

    // Crear perfil de usuario en Firestore
    const userProfile: Omit<UserProfile, "uid"> = {
      email,
      nombre,
      apellido,
      dni,
      role: "alumno",
      fechaRegistro: new Date(),
      fechaActualizacion: new Date(),
      aceptaTerminos,
      activo: true,
    };

    await firestore.collection("users").doc(userRecord.uid).set(userProfile);

    // Generar token personalizado para respuesta inmediata
    const customToken = await firebaseAuth.createCustomToken(userRecord.uid);

    return res.status(201).json({
      message: "Usuario registrado exitosamente",
      user: {
        uid: userRecord.uid,
        email: userRecord.email,
        nombre,
        apellido,
        role: "alumno",
      },
      customToken,
    });
  } catch (error: any) {
    console.error("Error en registro:", error);

    if (error.code === "auth/email-already-exists") {
      return res.status(409).json({
        error: "Ya existe un usuario registrado con este email",
      });
    }

    if (error.code === "auth/invalid-email") {
      return res.status(400).json({
        error: "Formato de email inválido",
      });
    }

    if (error.code === "auth/weak-password") {
      return res.status(400).json({
        error: "La contraseña es muy débil",
      });
    }

    return res.status(500).json({
      error: "Error interno del servidor",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

export const loginUser = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: "Email y contraseña son requeridos",
      });
    }

    // Validar formato de email
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        error: "Formato de email inválido",
      });
    }

    const firebaseApiKey = "AIzaSyAZDT5DM68-9qYH23HdKAsOTaV_qCAPEiw";

    console.log(`Intentando login para email: ${email}`);

    try {
      const response = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseApiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email,
            password,
            returnSecureToken: true,
          }),
        }
      );

      const authResult = await response.json();

      console.log(`Response status: ${response.status}`);
      console.log(`Auth result:`, {
        ...authResult,
        // No loggear tokens por seguridad
        idToken: authResult.idToken ? "[PRESENTE]" : "[AUSENTE]",
        refreshToken: authResult.refreshToken ? "[PRESENTE]" : "[AUSENTE]",
      });
      if (!response.ok) {
        console.error(`Error de Firebase Auth:`, authResult.error);

        // Manejar errores específicos de Firebase Auth
        if (authResult.error?.message === "EMAIL_NOT_FOUND") {
          console.log(`Usuario no encontrado: ${email}`);
          return res.status(401).json({
            error: "Credenciales inválidas",
          });
        }
        if (authResult.error?.message === "INVALID_PASSWORD") {
          console.log(`Contraseña incorrecta para: ${email}`);
          return res.status(401).json({
            error: "Credenciales inválidas",
          });
        }
        if (authResult.error?.message === "USER_DISABLED") {
          console.log(`Usuario deshabilitado: ${email}`);
          return res.status(403).json({
            error: "Usuario deshabilitado",
          });
        }
        if (authResult.error?.message === "TOO_MANY_ATTEMPTS_TRY_LATER") {
          console.log(`Demasiados intentos para: ${email}`);
          return res.status(429).json({
            error: "Demasiados intentos fallidos. Intente más tarde",
          });
        }

        return res.status(401).json({
          error: "Credenciales inválidas",
          details:
            process.env.NODE_ENV === "development"
              ? authResult.error?.message
              : undefined,
        });
      }
      // Si llegamos aquí, las credenciales son válidas
      const uid = authResult.localId;
      console.log(`Login exitoso para UID: ${uid}`);

      // Verificar datos adicionales en Firestore
      const userDoc = await firestore.collection("users").doc(uid).get();

      if (!userDoc.exists) {
        console.error(`Usuario ${uid} no encontrado en Firestore`);
        return res.status(404).json({
          error: "Usuario no encontrado en el sistema",
        });
      }

      const userData = userDoc.data();

      // Verificar que el usuario esté activo
      if (!userData?.activo) {
        console.log(`Usuario ${uid} está desactivado`);
        return res.status(403).json({
          error: "Usuario desactivado. Contacte al administrador",
        });
      }

      // Generar token personalizado para el sistema
      const customToken = await firebaseAuth.createCustomToken(uid);
      console.log(`Token personalizado generado para UID: ${uid}`);

      return res.json({
        message: "Login exitoso",
        customToken,
        user: {
          uid,
          email: userData.email,
          nombre: userData.nombre,
          apellido: userData.apellido,
          role: userData.role,
          ultimoLogin: new Date(),
        },
      });
    } catch (fetchError: any) {
      console.error("Error en la petición a Firebase Auth:", fetchError);

      if (
        fetchError.name === "TypeError" &&
        fetchError.message.includes("fetch")
      ) {
        return res.status(503).json({
          error: "Error de conectividad con el servicio de autenticación",
        });
      }

      return res.status(401).json({
        error: "Error validando credenciales",
        details:
          process.env.NODE_ENV === "development"
            ? fetchError.message
            : undefined,
      });
    }
  } catch (error: any) {
    console.error("Error general en login:", error);
    return res.status(500).json({
      error: "Error interno del servidor",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

export const getUserProfile = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const uid = req.user.uid;
    const userDoc = await firestore.collection("users").doc(uid).get();

    if (!userDoc.exists) {
      return res.status(404).json({
        error: "Usuario no encontrado",
      });
    }

    const userData = userDoc.data();

    if (!userData?.activo) {
      return res.status(403).json({
        error: "Usuario desactivado",
      });
    }

    return res.json({
      uid,
      ...userData,
      // Convertir timestamps de Firestore a fechas JavaScript
      fechaRegistro:
        userData.fechaRegistro?.toDate?.() || userData.fechaRegistro,
      fechaActualizacion:
        userData.fechaActualizacion?.toDate?.() || userData.fechaActualizacion,
      ultimoLogin: userData.ultimoLogin?.toDate?.() || userData.ultimoLogin,
    });
  } catch (error) {
    console.error("Error obteniendo perfil:", error);
    return res.status(500).json({
      error: "Error interno del servidor",
    });
  }
};

export const updateUserProfile = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const uid = req.user.uid;
    const { nombre, apellido } = req.body;

    // Validaciones
    if (!nombre && !apellido) {
      return res.status(400).json({
        error: "Debe proporcionar al menos un campo para actualizar",
      });
    }

    const updateData: any = {
      fechaActualizacion: new Date(),
    };

    if (nombre) {
      if (typeof nombre !== "string" || nombre.trim().length < 2) {
        return res.status(400).json({
          error: "El nombre debe tener al menos 2 caracteres",
        });
      }
      updateData.nombre = nombre.trim();
    }

    if (apellido) {
      if (typeof apellido !== "string" || apellido.trim().length < 2) {
        return res.status(400).json({
          error: "El apellido debe tener al menos 2 caracteres",
        });
      }
      updateData.apellido = apellido.trim();
    }

    // Actualizar en Firestore
    await firestore.collection("users").doc(uid).update(updateData);

    // Actualizar displayName en Firebase Auth si se cambió nombre o apellido
    if (nombre || apellido) {
      const userDoc = await firestore.collection("users").doc(uid).get();
      const userData = userDoc.data();

      const newDisplayName = `${updateData.nombre || userData?.nombre} ${
        updateData.apellido || userData?.apellido
      }`;

      await firebaseAuth.updateUser(uid, {
        displayName: newDisplayName,
      });
    }

    return res.json({
      message: "Perfil actualizado exitosamente",
    });
  } catch (error: any) {
    console.error("Error actualizando perfil:", error);

    if (error.code === "auth/user-not-found") {
      return res.status(404).json({
        error: "Usuario no encontrado",
      });
    }

    return res.status(500).json({
      error: "Error interno del servidor",
    });
  }
};

export const deleteUser = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user.uid;

    // Soft delete - marcar como inactivo
    await firestore.collection("users").doc(uid).update({
      activo: false,
      fechaEliminacion: new Date(),
      fechaActualizacion: new Date(),
    });

    return res.json({
      message: "Usuario desactivado exitosamente",
    });
  } catch (error) {
    console.error("Error eliminando usuario:", error);
    return res.status(500).json({
      error: "Error interno del servidor",
    });
  }
};

// Función para refrescar token
export const refreshToken = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const uid = req.user.uid;

    // Verificar que el usuario sigue activo
    const userDoc = await firestore.collection("users").doc(uid).get();

    if (!userDoc.exists) {
      return res.status(404).json({
        error: "Usuario no encontrado",
      });
    }

    const userData = userDoc.data();

    if (!userData?.activo) {
      return res.status(403).json({
        error: "Usuario desactivado",
      });
    }

    // Generar nuevo token
    const customToken = await firebaseAuth.createCustomToken(uid, {
      role: userData.role,
      email: userData.email,
    });

    return res.json({
      message: "Token renovado exitosamente",
      customToken,
    });
  } catch (error) {
    console.error("Error renovando token:", error);
    return res.status(500).json({
      error: "Error interno del servidor",
    });
  }
};
export const checkEmailExists = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        error: "Email es requerido",
      });
    }

    // Validar formato de email
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        error: "Formato de email inválido",
      });
    }

    console.log(`Verificando si existe email: ${email}`);

    try {
      // Usar Firebase Admin para verificar si el usuario existe
      const userRecord = await firebaseAuth.getUserByEmail(email);

      console.log(`Email ${email} encontrado con UID: ${userRecord.uid}`);

      // Verificar datos adicionales en Firestore
      const userDoc = await firestore
        .collection("users")
        .doc(userRecord.uid)
        .get();

      if (!userDoc.exists) {
        console.log(`Usuario ${userRecord.uid} no encontrado en Firestore`);
        return res.json({
          exists: false,
          message: "Usuario existe en Auth pero no en Firestore",
        });
      }

      const userData = userDoc.data();

      // Verificar que el usuario esté activo
      if (!userData?.activo) {
        console.log(`Usuario ${userRecord.uid} está desactivado`);
        return res.status(403).json({
          error: "Usuario desactivado. Contacte al administrador",
        });
      }

      return res.json({
        exists: true,
        user: {
          uid: userRecord.uid,
          email: userData.email,
          nombre: userData.nombre,
          apellido: userData.apellido,
          dni: userData.dni,
          role: userData.role,
        },
      });
    } catch (firebaseError: any) {
      if (firebaseError.code === "auth/user-not-found") {
        console.log(`Email ${email} no encontrado`);
        return res.json({
          exists: false,
          message: "Usuario no encontrado",
        });
      }

      console.error("Error verificando email:", firebaseError);
      return res.status(500).json({
        error: "Error verificando email",
        details:
          process.env.NODE_ENV === "development"
            ? firebaseError.message
            : undefined,
      });
    }
  } catch (error: any) {
    console.error("Error general en checkEmailExists:", error);
    return res.status(500).json({
      error: "Error interno del servidor",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
export const updateUserAdditionalData = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const uid = req.user.uid;
    const { telefono, provincia, tipoContribuyente, metodoPago, direccion } =
      req.body;

    // Validaciones opcionales
    if (telefono && typeof telefono !== "string") {
      return res.status(400).json({
        error: "Formato de teléfono inválido",
      });
    }

    if (provincia && typeof provincia !== "string") {
      return res.status(400).json({
        error: "Provincia inválida",
      });
    }

    // Verificar que el usuario existe
    const userDoc = await firestore.collection("users").doc(uid).get();

    if (!userDoc.exists) {
      return res.status(404).json({
        error: "Usuario no encontrado",
      });
    }

    const userData = userDoc.data();

    if (!userData?.activo) {
      return res.status(403).json({
        error: "Usuario desactivado",
      });
    }

    // Preparar datos para actualizar
    const updateData: any = {
      fechaActualizacion: new Date(),
    };

    // Solo agregar campos que no sean undefined/null
    if (telefono) updateData.telefono = telefono.trim();
    if (provincia) updateData.provincia = provincia;
    if (tipoContribuyente) updateData.tipoContribuyente = tipoContribuyente;
    if (metodoPago) updateData.metodoPago = metodoPago;
    if (direccion) updateData.direccion = direccion;

    // Actualizar en Firestore
    await firestore.collection("users").doc(uid).update(updateData);

    // Obtener datos actualizados
    const updatedUserDoc = await firestore.collection("users").doc(uid).get();
    const updatedUserData = updatedUserDoc.data();

    return res.json({
      message: "Datos adicionales actualizados exitosamente",
      user: {
        uid,
        ...updatedUserData,
        fechaRegistro:
          updatedUserData?.fechaRegistro?.toDate?.() ||
          updatedUserData?.fechaRegistro,
        fechaActualizacion:
          updatedUserData?.fechaActualizacion?.toDate?.() ||
          updatedUserData?.fechaActualizacion,
      },
    });
  } catch (error: any) {
    console.error("Error actualizando datos adicionales:", error);

    return res.status(500).json({
      error: "Error interno del servidor",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
