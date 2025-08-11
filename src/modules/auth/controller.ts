import { Request, Response } from "express";
import { firebaseAuth, firestore } from "../../config/firebase";
import { UserRegistrationData, UserProfile } from "../../types/user";
import { AuthenticatedRequest } from "../../middleware/authMiddleware";

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
    const loginAttemptInfo = (req as any).loginAttempt;

    // Log del intento de login para monitoreo
    console.log(
      `Intento de login: ${email} desde IP: ${
        loginAttemptInfo?.clientIP || "unknown"
      }`
    );

    try {
      const userRecord = await firebaseAuth.getUserByEmail(email);

      const userDoc = await firestore
        .collection("users")
        .doc(userRecord.uid)
        .get();

      if (!userDoc.exists) {
        return res.status(401).json({
          error: "Credenciales inválidas",
        });
      }

      const userData = userDoc.data();

      // Verificar que el usuario esté activo
      if (!userData?.activo) {
        return res.status(403).json({
          error: "Usuario desactivado. Contacte al administrador",
        });
      }


      await firestore
        .collection("users")
        .doc(userRecord.uid)
        .update({
          ultimoLogin: new Date(),
          loginCount: (userData.loginCount || 0) + 1,
        });

      // Generar token personalizado
      const customToken = await firebaseAuth.createCustomToken(userRecord.uid, {
        role: userData.role,
        email: userData.email,
      });

      // Log de login exitoso
      console.log(`✅ Login exitoso: ${email} (${userRecord.uid})`);

      return res.json({
        message: "Login exitoso",
        customToken,
        user: {
          uid: userRecord.uid,
          email: userRecord.email,
          nombre: userData.nombre,
          apellido: userData.apellido,
          role: userData.role,
          ultimoLogin: new Date(),
        },
      });
    } catch (authError: any) {
      // Log del error para debugging
      console.log(
        `❌ Login fallido: ${email} - ${authError.code || "unknown_error"}`
      );

      if (authError.code === "auth/user-not-found") {
        return res.status(401).json({
          error: "Credenciales inválidas",
        });
      }
      throw authError;
    }
  } catch (error: any) {
    console.error("Error en login:", error);

    return res.status(500).json({
      error: "Error interno del servidor",
    });
  }
};

export const verifyPassword = async (email: string, password: string) => {
  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.FIREBASE_API_KEY}`,
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

    if (!response.ok) {
      const errorData = await response.json();
      return { success: false, error: errorData.error };
    }

    const data = await response.json();
    return { success: true, idToken: data.idToken, localId: data.localId };
  } catch (error) {
    return { success: false, error: "Error verificando credenciales" };
  }
};

// Versión mejorada del login con verificación de contraseña
export const loginUserSecure = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: "Email y contraseña son requeridos",
      });
    }

    // Verificar credenciales usando Firebase Auth REST API
    const passwordVerification = await verifyPassword(email, password);

    if (!passwordVerification.success) {
      return res.status(401).json({
        error: "Credenciales inválidas",
      });
    }

    // Obtener información del usuario
    const userRecord = await firebaseAuth.getUserByEmail(email);
    const userDoc = await firestore
      .collection("users")
      .doc(userRecord.uid)
      .get();

    if (!userDoc.exists) {
      return res.status(404).json({
        error: "Usuario no encontrado",
      });
    }

    const userData = userDoc.data();

    if (!userData?.activo) {
      return res.status(403).json({
        error: "Usuario desactivado. Contacte al administrador",
      });
    }

    // Actualizar última fecha de login
    await firestore.collection("users").doc(userRecord.uid).update({
      ultimoLogin: new Date(),
    });

    // Generar token personalizado
    const customToken = await firebaseAuth.createCustomToken(userRecord.uid, {
      role: userData.role,
      email: userData.email,
    });

    return res.json({
      message: "Login exitoso",
      customToken,
      user: {
        uid: userRecord.uid,
        email: userRecord.email,
        nombre: userData.nombre,
        apellido: userData.apellido,
        role: userData.role,
        ultimoLogin: new Date(),
      },
    });
  } catch (error: any) {
    console.error("Error en login seguro:", error);
    return res.status(500).json({
      error: "Error interno del servidor",
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
