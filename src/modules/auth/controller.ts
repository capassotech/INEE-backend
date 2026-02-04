import type { Request, Response } from "express";
import { firebaseAuth, firestore } from "../../config/firebase";
import type { UserRegistrationData, UserProfile } from "../../types/user";
import type { AuthenticatedRequest } from "../../middleware/authMiddleware";
import { Resend } from "resend";
// Firebase Admin SDK ya está importado desde firebase config

const resend = new Resend(process.env.RESEND_API_KEY);

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

    // NUEVO: Verificar si ya existe un usuario con ese email
    let existingAuthUser;
    try {
      existingAuthUser = await firebaseAuth.getUserByEmail(email);
    } catch (authError: any) {
      if (authError.code !== "auth/user-not-found") {
        console.error("Error verificando usuario:", authError);
      }
    }

    // Si existe un usuario con ese email
    if (existingAuthUser) {
      const providers = existingAuthUser.providerData.map((p) => p.providerId);
      const hasPasswordProvider = providers.includes("password");
      const hasGoogleProvider = providers.includes("google.com");

      // Si ya tiene email/password → Error: Email ya registrado
      if (hasPasswordProvider) {
        return res.status(409).json({
          error: "Ya existe un usuario registrado con este email",
        });
      }

      // Si solo tiene Google → Ofrecer vincular password
      if (hasGoogleProvider && !hasPasswordProvider) {
        return res.status(409).json({
          code: "USER_EXISTS_WITH_GOOGLE",
          email: email,
          existingUid: existingAuthUser.uid,
          message: "Ya tenés una cuenta con Google. ¿Querés agregar contraseña a tu cuenta?",
        });
      }
    }

    // Si no existe o no tiene conflicto, crear usuario normal
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
      provider: "password",
      fechaRegistro: new Date(),
      fechaActualizacion: new Date(),
      aceptaTerminos,
      activo: true,
    };

    await firestore.collection("users").doc(userRecord.uid).set(userProfile);

    // Generar token personalizado
    const customToken = await firebaseAuth.createCustomToken(userRecord.uid);

    // Email de bienvenida
    await resend.emails.send({
      from: "INEE Oficial <contacto@ineeoficial.com>",
      to: userRecord.email || "",
      subject: "Bienvenida a INEE®. Acceso al campus virtual",
      html: `
        <p>Hola ${nombre},</p>
        <p>Te damos la bienvenida a <strong>INEE® – Instituto de Negocios Emprendedor Empresarial</strong>.<br>
        Tu inscripción fue confirmada y ya tenés acceso al campus de formación.</p>
        <p>INEE® es un espacio de formación profesional orientado a la consultoría estratégica, el liderazgo y el desarrollo emprendedor. Las formaciones están diseñadas para fortalecer criterio profesional, capacidad de análisis y toma de decisiones con método.</p>
        <p>En el campus vas a encontrar contenidos con base conceptual sólida y aplicación práctica, organizados a partir del <strong>método DAACRE®</strong>, nuestro marco de intervención profesional.</p>
        <p><strong>Ingresá al campus desde acá:</strong> <a href="https://estudiante.ineeoficial.com">https://estudiante.ineeoficial.com</a></p>
        <strong>Felicitaciones por formar parte de INEE®.</strong><br>
        Nos alegra acompañarte en este recorrido.</p>
      `,
    });

    return res.status(201).json({
      message: "Usuario registrado exitosamente",
      user: {
        uid: userRecord.uid,
        email: userRecord.email,
        nombre,
        apellido,
        role: "alumno",
        dni,
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

export const linkPasswordProvider = async (req: Request, res: Response) => {
  try {
    const { email, password, nombre, apellido, dni, aceptaTerminos } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: "Email y contraseña son requeridos",
      });
    }

    // Verificar que el usuario existe y solo tiene Google
    let existingAuthUser;
    try {
      existingAuthUser = await firebaseAuth.getUserByEmail(email);
    } catch (authError: any) {
      return res.status(404).json({
        error: "Usuario no encontrado",
      });
    }

    const providers = existingAuthUser.providerData.map((p) => p.providerId);
    const hasPasswordProvider = providers.includes("password");
    const hasGoogleProvider = providers.includes("google.com");

    // Verificar que solo tenga Google
    if (!hasGoogleProvider) {
      return res.status(400).json({
        error: "Este usuario no está registrado con Google",
      });
    }

    if (hasPasswordProvider) {
      return res.status(409).json({
        error: "Este usuario ya tiene contraseña configurada",
      });
    }

    // Agregar contraseña al usuario existente
    await firebaseAuth.updateUser(existingAuthUser.uid, {
      password: password,
    });

    // Preparar datos para actualizar
    const updateData: any = {
      provider: "google,password",  // Importante: mantener ambos
      fechaActualizacion: new Date(),
    };

    // Solo actualizar campos si se proporcionan (para registro)
    if (nombre) updateData.nombre = nombre;
    if (apellido) updateData.apellido = apellido;
    if (dni) updateData.dni = dni;
    if (aceptaTerminos !== undefined) updateData.aceptaTerminos = aceptaTerminos;

    // Actualizar Firestore
    await firestore.collection("users").doc(existingAuthUser.uid).update(updateData);

    // Obtener datos actualizados
    const userDoc = await firestore.collection("users").doc(existingAuthUser.uid).get();
    const userData = userDoc.data();

    const customToken = await firebaseAuth.createCustomToken(existingAuthUser.uid);

    return res.json({
      message: "Contraseña agregada exitosamente a tu cuenta",
      token: customToken,
      user: {
        uid: existingAuthUser.uid,
        email: userData?.email,
        nombre: userData?.nombre,
        apellido: userData?.apellido,
        role: userData?.role,
        dni: userData?.dni,
      },
    });
  } catch (error: any) {
    console.error("Error en linkPasswordProvider:", error);

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

    let existingUser;
    try {
      existingUser = await firebaseAuth.getUserByEmail(email);
      
      const providers = existingUser.providerData.map((p) => p.providerId);
      const hasPasswordProvider = providers.includes("password");
      const hasGoogleProvider = providers.includes("google.com");

      console.log(`[LOGIN] Usuario encontrado. Proveedores:`, providers);

      // Si solo tiene Google (no tiene password configurado)
      if (hasGoogleProvider && !hasPasswordProvider) {
        console.log(`[LOGIN] Usuario solo tiene Google, ofrecer agregar password`);
        
        return res.status(409).json({
          code: "USER_HAS_GOOGLE_ONLY",
          email: email,
          existingUid: existingUser.uid,
          message: "Ya tenés una cuenta con Google. ¿Querés agregar contraseña a tu cuenta?",
        });
      }
      
      // Si tiene password, continuar con el login normal
      console.log(`[LOGIN] Usuario tiene password configurado, procediendo con login`);
      
    } catch (getUserError: any) {
      if (getUserError.code === 'auth/user-not-found') {
        console.log(`[LOGIN] Usuario no encontrado, intentando login de todas formas`);
      } else {
        console.error("[LOGIN] Error verificando usuario:", getUserError);
      }
    }

    let firebaseApiKey = process.env.FIREBASE_API_KEY;
    const projectId = process.env.FIREBASE_PROJECT_ID;

    if (!firebaseApiKey) {
      if (projectId === "inee-qa") {
        firebaseApiKey = "AIzaSyC0mx89rSeedrdTtpyqrlhS7FAIejCrIWM";
      } else {
        firebaseApiKey = "AIzaSyAZDT5DM68-9qYH23HdKAsOTaV_qCAPEiw";
      }
    }

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

      if (!response.ok) {
        console.error(`Error de Firebase Auth:`, authResult.error);

        // Manejar errores específicos de Firebase Auth
        if (authResult.error?.message === "USER_DISABLED") {
          return res.status(403).json({
            error: "Usuario deshabilitado",
          });
        }
        if (authResult.error?.message === "TOO_MANY_ATTEMPTS_TRY_LATER") {
          return res.status(429).json({
            error: "Demasiados intentos fallidos. Intente más tarde",
          });
        }

        return res.status(401).json({
          error: "Credenciales inválidas",
        });
      }
      // Si llegamos aquí, las credenciales son válidas
      const uid = authResult.localId;

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
        return res.status(403).json({
          error: "Usuario desactivado. Contacte al administrador",
        });
      }

      const idToken = authResult.idToken;

      return res.json({
        message: "Login exitoso",
        idToken, // Cambiado de customToken a idToken
        customToken: await firebaseAuth.createCustomToken(uid), // Mantener por compatibilidad
        user: {
          uid,
          email: userData.email,
          nombre: userData.nombre,
          apellido: userData.apellido,
          role: userData.role,
          // MEMBRESÍAS DESACTIVADAS
          // id_membresia: userData.membresia_id,
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

export const googleAuth = async (req: Request, res: Response) => {
  try {
    const { idToken, dni, aceptaTerminos } = req.body;

    if (!idToken) {
      return res.status(400).json({
        error: "Token de Google requerido",
      });
    }

    // Verificar el token de Google
    const decodedToken = await firebaseAuth.verifyIdToken(idToken);
    const { uid: googleUid, picture, email: googleEmail, name } = decodedToken;

    if (!googleEmail) {
      return res.status(400).json({
        error: "No se pudo determinar el email del usuario de Google",
      });
    }

    console.log(`[GOOGLE AUTH] Procesando autenticación para: ${googleEmail}`);

    // Buscar si existe un usuario con ese email
    let existingAuthUser;
    try {
      existingAuthUser = await firebaseAuth.getUserByEmail(googleEmail);
      console.log(`[GOOGLE AUTH] Usuario encontrado en Auth:`, existingAuthUser.uid);
    } catch (authError: any) {
      if (authError.code !== "auth/user-not-found") {
        console.error("[GOOGLE AUTH] Error verificando usuario:", authError);
      } else {
        console.log(`[GOOGLE AUTH] Usuario no existe en Auth, es nuevo`);
      }
    }

    // CASO 1: Usuario existe
    if (existingAuthUser) {
      const providers = existingAuthUser.providerData.map((p) => p.providerId);
      const hasPasswordProvider = providers.includes("password");
      const hasGoogleProvider = providers.includes("google.com");

      console.log(`[GOOGLE AUTH] Proveedores actuales:`, providers);

      // ============================================================
      // CASO 1.A: Usuario tiene AMBOS proveedores (vinculación automática de Firebase)
      // ============================================================
      if (hasPasswordProvider && hasGoogleProvider) {
        console.log(`[GOOGLE AUTH] Usuario ya tiene ambos proveedores vinculados automáticamente por Firebase`);

        const userDoc = await firestore.collection("users").doc(existingAuthUser.uid).get();

        // Si el usuario existe en Firestore, actualizar provider correctamente
        if (userDoc.exists) {
          const userData = userDoc.data();
          
          if (!userData) {
            return res.status(500).json({
              error: "Error interno: datos de usuario no disponibles",
            });
          }
          
          // CRÍTICO: Asegurar que Firestore refleje ambos proveedores
          if (userData.provider !== "password,google" && userData.provider !== "google,password") {
            console.log(`[GOOGLE AUTH] Actualizando provider en Firestore a "password,google"`);
            await firestore.collection("users").doc(existingAuthUser.uid).update({
              provider: "password,google",
              photoURL: picture || userData.photoURL || "",
              ultimoAcceso: new Date(),
              fechaActualizacion: new Date(),
            });
          } else {
            // Solo actualizar foto y último acceso
            await firestore.collection("users").doc(existingAuthUser.uid).update({
              photoURL: picture || userData.photoURL || "",
              ultimoAcceso: new Date(),
            });
          }

          if (!userData?.activo) {
            return res.status(403).json({
              error: "Usuario desactivado",
            });
          }

          const customToken = await firebaseAuth.createCustomToken(existingAuthUser.uid);

          return res.json({
            message: "Login exitoso con Google",
            user: {
              uid: existingAuthUser.uid,
              email: userData.email,
              nombre: userData.nombre,
              apellido: userData.apellido,
              role: userData.role,
              photoURL: picture || userData.photoURL,
              dni: userData.dni || null,
              needsDni: !userData.dni,
            },
            token: customToken,
          });
        }

        // Si no existe en Firestore pero tiene ambos proveedores, es un caso raro
        // Crearlo con DNI si se proporcionó
        if (dni && aceptaTerminos !== undefined) {
          const displayName = name || decodedToken.name || "";
          const nameParts = displayName.split(" ");
          const nombreFromGoogle = nameParts[0] || "";
          const apellidoFromGoogle = nameParts.slice(1).join(" ") || "";

          const existingDniQuery = await firestore
            .collection("users")
            .where("dni", "==", dni)
            .get();

          if (!existingDniQuery.empty) {
            return res.status(409).json({
              error: "Ya existe un usuario registrado con este DNI",
            });
          }

          const userProfile = {
            email: googleEmail,
            nombre: nombreFromGoogle,
            apellido: apellidoFromGoogle,
            dni: dni,
            photoURL: picture || "",
            provider: "password,google",
            fechaRegistro: new Date(),
            aceptaTerminos: aceptaTerminos,
            activo: true,
            role: "alumno",
          };

          await firestore.collection("users").doc(existingAuthUser.uid).set(userProfile);

          const customToken = await firebaseAuth.createCustomToken(existingAuthUser.uid);

          await resend.emails.send({
            from: "INEE Oficial <contacto@ineeoficial.com>",
            to: googleEmail,
            subject: "Bienvenida a INEE®. Acceso al campus virtual",
            html: `
          <p>Hola ${nombreFromGoogle},</p>
          <p>Te damos la bienvenida a INEE® – Instituto de Negocios Emprendedor Empresarial.<br>
          Tu inscripción fue confirmada y ya tenés acceso al campus de formación.</p>
          <p>INEE® es un espacio de formación profesional orientado a la consultoría estratégica, el liderazgo y el desarrollo emprendedor. Las formaciones están diseñadas para fortalecer criterio profesional, capacidad de análisis y toma de decisiones con método.</p>
          <p>En el campus vas a encontrar contenidos con base conceptual sólida y aplicación práctica, organizados a partir del método DAACRE®, nuestro marco de intervención profesional.</p>
          <p>Ingresá al campus desde acá: <a href="https://ineeoficial.com">https://ineeoficial.com</a></p>
          <p>Felicitaciones por formar parte de INEE®.<br>
          Nos alegra acompañarte en este recorrido.</p>
        `,
          });

          return res.status(201).json({
            message: "Usuario registrado exitosamente con Google",
            user: {
              uid: existingAuthUser.uid,
              email: googleEmail,
              nombre: nombreFromGoogle,
              apellido: apellidoFromGoogle,
              role: "alumno",
              dni: dni,
              needsDni: false,
            },
            token: customToken,
          });
        }

        // Si no proporcionó DNI, pedirlo
        return res.status(404).json({
          error: "Usuario no registrado, por favor registrate",
        });
      }

      // ============================================================
      // CASO 1.B: Usuario tiene password pero NO tiene Google vinculado
      // ============================================================
      if (hasPasswordProvider && !hasGoogleProvider) {
        console.log(`[GOOGLE AUTH] Usuario tiene password, necesita vincular Google`);

        // IMPORTANTE: Si llegamos acá, Firebase NO vinculó automáticamente
        // Esto significa que el usuario rechazó la vinculación o hay configuración especial
        
        // Eliminar el usuario de Google que se creó automáticamente (si es diferente)
        if (googleUid !== existingAuthUser.uid) {
          try {
            await firebaseAuth.deleteUser(googleUid);
            console.log(`[GOOGLE AUTH] Usuario de Google duplicado (${googleUid}) eliminado`);
          } catch (deleteError) {
            console.error("[GOOGLE AUTH] Error eliminando usuario duplicado:", deleteError);
          }
        }

        // Devolver que necesita vincular con password
        return res.status(409).json({
          code: "NEEDS_PASSWORD_TO_LINK",
          email: googleEmail,
          existingUid: existingAuthUser.uid,
          message: "Ya tenés una cuenta con este email. Ingresá tu contraseña para vincular Google",
        });
      }

      // ============================================================
      // CASO 1.C: Usuario solo tiene Google (login normal)
      // ============================================================
      console.log(`[GOOGLE AUTH] Usuario ya tiene Google, login normal`);

      const userDoc = await firestore.collection("users").doc(existingAuthUser.uid).get();

      if (!userDoc.exists) {
        console.log(`[GOOGLE AUTH] Usuario existe en Auth pero no en Firestore, creando perfil...`);

        if (dni && aceptaTerminos !== undefined) {
          const displayName = name || decodedToken.name || "";
          const nameParts = displayName.split(" ");
          const nombreFromGoogle = nameParts[0] || "";
          const apellidoFromGoogle = nameParts.slice(1).join(" ") || "";

          const existingDniQuery = await firestore
            .collection("users")
            .where("dni", "==", dni)
            .get();

          if (!existingDniQuery.empty) {
            return res.status(409).json({
              error: "Ya existe un usuario registrado con este DNI",
            });
          }

          const userProfile = {
            email: googleEmail,
            nombre: nombreFromGoogle,
            apellido: apellidoFromGoogle,
            dni: dni,
            photoURL: picture || "",
            provider: hasPasswordProvider ? "password,google" : "google",
            fechaRegistro: new Date(),
            aceptaTerminos: aceptaTerminos,
            activo: true,
            role: "alumno",
          };

          await firestore.collection("users").doc(existingAuthUser.uid).set(userProfile);

          console.log(`[GOOGLE AUTH] Perfil creado en Firestore para usuario existente en Auth`);

          const customToken = await firebaseAuth.createCustomToken(existingAuthUser.uid);

          await resend.emails.send({
            from: "INEE Oficial <contacto@ineeoficial.com>",
            to: googleEmail,
            subject: "Bienvenida a INEE®. Acceso al campus virtual",
            html: `
          <p>Hola ${nombreFromGoogle},</p>
          <p>Te damos la bienvenida a INEE® – Instituto de Negocios Emprendedor Empresarial.<br>
          Tu inscripción fue confirmada y ya tenés acceso al campus de formación.</p>
          <p>INEE® es un espacio de formación profesional orientado a la consultoría estratégica, el liderazgo y el desarrollo emprendedor. Las formaciones están diseñadas para fortalecer criterio profesional, capacidad de análisis y toma de decisiones con método.</p>
          <p>En el campus vas a encontrar contenidos con base conceptual sólida y aplicación práctica, organizados a partir del método DAACRE®, nuestro marco de intervención profesional.</p>
          <p>Ingresá al campus desde acá: <a href="https://ineeoficial.com">https://ineeoficial.com</a></p>
          <p>Felicitaciones por formar parte de INEE®.<br>
          Nos alegra acompañarte en este recorrido.</p>
        `,
          });

          return res.status(201).json({
            message: "Usuario registrado exitosamente con Google",
            user: {
              uid: existingAuthUser.uid,
              email: googleEmail,
              nombre: nombreFromGoogle,
              apellido: apellidoFromGoogle,
              role: "alumno",
              dni: dni,
              needsDni: false,
            },
            token: customToken,
          });
        } else {
          console.log(`[GOOGLE AUTH] Usuario huérfano en Auth sin datos de registro`);

          return res.status(404).json({
            error: "Usuario no registrado, por favor registrate",
          });
        }
      }

      const userData = userDoc.data();

      if (!userData?.activo) {
        return res.status(403).json({
          error: "Usuario desactivado",
        });
      }

      // Actualizar foto y último acceso
      await firestore.collection("users").doc(existingAuthUser.uid).update({
        photoURL: picture || userData.photoURL || "",
        ultimoAcceso: new Date(),
      });

      const customToken = await firebaseAuth.createCustomToken(existingAuthUser.uid);

      return res.json({
        message: "Login exitoso con Google",
        user: {
          uid: existingAuthUser.uid,
          email: userData.email,
          nombre: userData.nombre,
          apellido: userData.apellido,
          role: userData.role,
          photoURL: picture || userData.photoURL,
          dni: userData.dni || null,
          needsDni: !userData.dni,
        },
        token: customToken,
      });
    }

    // CASO 2: Usuario completamente nuevo
    console.log(`[GOOGLE AUTH] Usuario nuevo con Google`);

    // Verificar que no exista ya en Firestore con este googleUid
    const existingUser = await firestore.collection("users").doc(googleUid).get();

    if (existingUser.exists) {
      console.log(`[GOOGLE AUTH] Usuario ya existe en Firestore, login`);
      const userData = existingUser.data();
      const customToken = await firebaseAuth.createCustomToken(googleUid);

      return res.json({
        message: "Login exitoso con Google",
        user: {
          uid: googleUid,
          email: userData?.email,
          nombre: userData?.nombre,
          apellido: userData?.apellido,
          role: userData?.role,
          dni: userData?.dni || null,
          needsDni: !userData?.dni,
        },
        token: customToken,
      });
    }

    // Si es nuevo y NO envió DNI → Pedir que complete el registro
    if (!dni || aceptaTerminos === undefined) {
      console.log(`[GOOGLE AUTH] Usuario nuevo, necesita completar registro con DNI`);

      // Extraer nombre y apellido del displayName de Google
      const displayName = name || "";
      const nameParts = displayName.split(" ");
      const nombre = nameParts[0] || "";
      const apellido = nameParts.slice(1).join(" ") || "";

      return res.status(400).json({
        code: "NEEDS_REGISTRATION_DATA",
        message: "Completá tu registro ingresando tu DNI",
        userData: {
          email: googleEmail,
          nombre: nombre,
          apellido: apellido,
          photoURL: picture,
        },
      });
    }

    // Verificar que el DNI no exista ya
    const existingDniQuery = await firestore
      .collection("users")
      .where("dni", "==", dni)
      .get();

    if (!existingDniQuery.empty) {
      return res.status(409).json({
        error: "Ya existe un usuario registrado con este DNI",
      });
    }

    // Crear nuevo usuario con Google (CON DNI)
    const displayName = name || "";
    const nameParts = displayName.split(" ");
    const nombre = nameParts[0] || "";
    const apellido = nameParts.slice(1).join(" ") || "";

    const userProfile = {
      email: googleEmail,
      nombre: nombre,
      apellido: apellido,
      dni: dni,
      photoURL: picture || "",
      provider: "google",
      fechaRegistro: new Date(),
      aceptaTerminos: aceptaTerminos,
      activo: true,
      role: "alumno",
    };

    await firestore.collection("users").doc(googleUid).set(userProfile);

    const customToken = await firebaseAuth.createCustomToken(googleUid);

    // Email de bienvenida
    await resend.emails.send({
      from: "INEE Oficial <contacto@ineeoficial.com>",
      to: googleEmail,
      subject: "Bienvenida a INEE®. Acceso al campus virtual",
      html: `
        <p>Hola ${nombre},</p>
        <p>Te damos la bienvenida a INEE® – Instituto de Negocios Emprendedor Empresarial.<br>
        Tu inscripción fue confirmada y ya tenés acceso al campus de formación.</p>
        <p>INEE® es un espacio de formación profesional orientado a la consultoría estratégica, el liderazgo y el desarrollo emprendedor. Las formaciones están diseñadas para fortalecer criterio profesional, capacidad de análisis y toma de decisiones con método.</p>
        <p>En el campus vas a encontrar contenidos con base conceptual sólida y aplicación práctica, organizados a partir del método DAACRE®, nuestro marco de intervención profesional.</p>
        <p>Ingresá al campus desde acá: <a href="https://ineeoficial.com">https://ineeoficial.com</a></p>
        <p>Felicitaciones por formar parte de INEE®.<br>
        Nos alegra acompañarte en este recorrido.</p>
      `,
    });

    console.log(`[GOOGLE AUTH] Usuario registrado exitosamente con Google`);

    return res.status(201).json({
      message: "Usuario registrado exitosamente con Google",
      user: {
        uid: googleUid,
        email: googleEmail,
        nombre: nombre,
        apellido: apellido,
        role: "alumno",
        dni: dni,
        needsDni: false,
      },
      token: customToken,
    });
  } catch (error: any) {
    console.error("[GOOGLE AUTH] Error:", error);
    return res.status(500).json({
      error: "Error interno del servidor",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

export const getUserById = async (req: Request, res: Response) => {
  try {
    const { uid } = req.params;
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
    });
  } catch (error) {
    console.error("Error obteniendo usuario:", error);
    return res.status(500).json({
      error: "Error interno del servidor",
    });
  }
};

export const getUserByEmail = async (req: Request, res: Response) => {
  try {
    const { email } = req.params;
    const userDoc = await firestore
      .collection("users")
      .where("email", "==", email)
      .get();

    if (userDoc.empty) {
      return res.status(404).json({
        error: "Usuario no encontrado",
        exists: false,
      });
    }

    const userData = userDoc.docs[0].data();
    const userId = userDoc.docs[0].id;

    return res.json({
      message: "Usuario encontrado",
      exists: true,
      user: {
        uid: userId,
        email: userData.email,
        nombre: userData.nombre,
        apellido: userData.apellido,
        activo: userData.activo,
      },
    });
  } catch (error) {
    console.error("Error obteniendo usuario por email:", error);
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

    // MEMBRESÍAS DESACTIVADAS - Comentado para posible reactivación futura
    /* let membresia = null;
    if (userData.membresia) { 
      const membresiaDoc = await firestore
        .collection("membresias")
        .doc(userData.membresia) 
        .get();

      if (membresiaDoc.exists) {
        const membresiaData = membresiaDoc.data();

        // ✅ Verificar que membresiaData exista y tenga nombre
        if (membresiaData && typeof membresiaData.nombre === "string") {
          membresia = {
            id: membresiaDoc.id,
            nombre: membresiaData.nombre,
          };
        }
      }
    } */

    return res.json({
      uid,
      ...userData,
      // membresia, // MEMBRESÍAS DESACTIVADAS
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

      const newDisplayName = `${updateData.nombre || userData?.nombre} ${updateData.apellido || userData?.apellido
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

export const validateToken = async (req: Request, res: Response) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({
        error: "Token es requerido",
      });
    }

    console.log("[AUTH] Validando token de la tienda...");
    console.log("[AUTH] Proyecto Firebase configurado en backend:", process.env.FIREBASE_PROJECT_ID);

    // Validar el token con Firebase Admin
    let decodedToken;
    try {
      decodedToken = await firebaseAuth.verifyIdToken(idToken);
      console.log("[AUTH] Token validado exitosamente. UID:", decodedToken.uid);
    } catch (verifyError: any) {
      console.error("[AUTH] Error al verificar token:", verifyError.code, verifyError.message);

      // Si el error es porque el token es de otro proyecto, dar un mensaje más claro
      if (verifyError.code === "auth/invalid-id-token" || verifyError.code === "auth/argument-error") {
        console.error("[AUTH] El token puede ser de un proyecto de Firebase diferente");
        return res.status(401).json({
          error: "Token inválido",
          details: "El token no pertenece al proyecto de Firebase configurado en el backend. Verifica que el backend esté configurado con el mismo proyecto que la tienda.",
          code: verifyError.code,
        });
      }

      if (verifyError.code === "auth/id-token-expired") {
        return res.status(401).json({
          error: "Token expirado",
          details: "El token de autenticación ha expirado. Por favor, vuelve a iniciar sesión en la tienda.",
        });
      }

      throw verifyError;
    }

    const uid = decodedToken.uid;

    // Verificar que el usuario existe en Firestore
    const userDoc = await firestore.collection("users").doc(uid).get();

    if (!userDoc.exists) {
      console.error("[AUTH] Usuario no encontrado en Firestore:", uid);
      return res.status(404).json({
        error: "Usuario no encontrado",
        details: `No se encontró el usuario con UID ${uid} en la base de datos.`,
      });
    }

    const userData = userDoc.data();

    // Verificar que el usuario esté activo
    if (!userData?.activo) {
      console.error("[AUTH] Usuario desactivado:", uid);
      return res.status(403).json({
        error: "Usuario desactivado. Contacte al administrador",
      });
    }

    // Generar customToken para la plataforma
    console.log("[AUTH] Generando customToken para la plataforma del estudiante...");
    const customToken = await firebaseAuth.createCustomToken(uid, {
      role: userData.role,
      email: userData.email,
    });

    console.log("[AUTH] Token validado y customToken generado exitosamente");

    return res.json({
      message: "Token validado exitosamente",
      customToken,
      user: {
        uid,
        email: userData.email,
        nombre: userData.nombre,
        apellido: userData.apellido,
        role: userData.role,
      },
    });
  } catch (error: any) {
    console.error("[AUTH] Error validando token:", error);
    console.error("[AUTH] Error code:", error.code);
    console.error("[AUTH] Error message:", error.message);

    if (error.code === "auth/id-token-expired") {
      return res.status(401).json({
        error: "Token expirado",
        details: "El token de autenticación ha expirado. Por favor, vuelve a iniciar sesión en la tienda.",
      });
    }

    if (error.code === "auth/invalid-id-token") {
      return res.status(401).json({
        error: "Token inválido",
        details: "El token no es válido. Puede ser que el token sea de un proyecto de Firebase diferente al configurado en el backend.",
      });
    }

    return res.status(500).json({
      error: "Error interno del servidor",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
      code: error.code,
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


    try {
      // Usar Firebase Admin para verificar si el usuario existe
      const userRecord = await firebaseAuth.getUserByEmail(email);


      // Verificar datos adicionales en Firestore
      const userDoc = await firestore
        .collection("users")
        .doc(userRecord.uid)
        .get();

      if (!userDoc.exists) {
        return res.json({
          exists: false,
          message: "Usuario existe en Auth pero no en Firestore",
        });
      }

      const userData = userDoc.data();

      // Verificar que el usuario esté activo
      if (!userData?.activo) {
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

export const linkGoogleProvider = async (req: Request, res: Response) => {
  try {
    const { email, password, googleIdToken } = req.body;

    if (!email || !password || !googleIdToken) {
      return res.status(400).json({
        error: "Email, contraseña y token de Google requeridos",
      });
    }

    console.log(`[LINK GOOGLE] Intentando vincular Google para: ${email}`);

    // PASO 1: Verificar la contraseña del usuario
    let firebaseApiKey = process.env.FIREBASE_API_KEY;
    const projectId = process.env.FIREBASE_PROJECT_ID;

    if (!firebaseApiKey) {
      if (projectId === "inee-qa") {
        firebaseApiKey = "AIzaSyC0mx89rSeedrdTtpyqrlhS7FAIejCrIWM";
      } else {
        firebaseApiKey = "AIzaSyAZDT5DM68-9qYH23HdKAsOTaV_qCAPEiw";
      }
    }

    // Validar la contraseña
    const authResponse = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          returnSecureToken: true,
        }),
      }
    );

    const authResult = await authResponse.json();

    if (!authResponse.ok) {
      console.error(`[LINK GOOGLE] Contraseña incorrecta`);
      return res.status(401).json({
        error: "Contraseña incorrecta",
      });
    }

    const uid = authResult.localId;
    const userIdToken = authResult.idToken;

    // PASO 2: Verificar el token de Google
    let googleDecodedToken;
    try {
      googleDecodedToken = await firebaseAuth.verifyIdToken(googleIdToken);
    } catch (error) {
      console.error("[LINK GOOGLE] Token de Google inválido:", error);
      return res.status(400).json({
        error: "Token de Google inválido",
      });
    }

    const googleUid = googleDecodedToken.uid;
    const googleEmail = googleDecodedToken.email;

    // PASO 3: Verificar que los emails coinciden
    if (email !== googleEmail) {
      console.error("[LINK GOOGLE] Emails no coinciden");
      return res.status(400).json({
        error: "Los emails no coinciden",
      });
    }

    // PASO 4: Obtener los proveedores actuales del usuario
    const existingUser = await firebaseAuth.getUser(uid);
    const providers = existingUser.providerData.map((p) => p.providerId);

    // PASO 5: Verificar que no tenga ya Google vinculado
    if (providers.includes("google.com")) {
      console.log("[LINK GOOGLE] Usuario ya tiene Google vinculado");
      
      // Eliminar el usuario de Google duplicado
      if (googleUid !== uid) {
        try {
          await firebaseAuth.deleteUser(googleUid);
          console.log(`[LINK GOOGLE] Usuario de Google duplicado (${googleUid}) eliminado`);
        } catch (deleteError) {
          console.error("[LINK GOOGLE] Error eliminando usuario duplicado:", deleteError);
        }
      }

      // Generar token y retornar
      const customToken = await firebaseAuth.createCustomToken(uid);
      const userDoc = await firestore.collection("users").doc(uid).get();
      const userData = userDoc.data();

      return res.json({
        message: "Ya tenías Google vinculado. Sesión iniciada correctamente",
        token: customToken,
        user: {
          uid,
          email: userData?.email,
          nombre: userData?.nombre,
          apellido: userData?.apellido,
          role: userData?.role,
          dni: userData?.dni || null,
        },
      });
    }

    console.log(`[LINK GOOGLE] Proveedores actuales: ${providers.join(", ")}`);

    // PASO 6: CRÍTICO - Eliminar el usuario de Google ANTES de actualizar Firestore
    // Esto es necesario porque Firebase Auth creó un usuario separado
    if (googleUid !== uid) {
      try {
        console.log(`[LINK GOOGLE] Eliminando usuario de Google duplicado (${googleUid})...`);
        await firebaseAuth.deleteUser(googleUid);
        console.log(`[LINK GOOGLE] Usuario de Google duplicado eliminado exitosamente`);
      } catch (deleteError: any) {
        console.error("[LINK GOOGLE] Error eliminando usuario de Google:", deleteError);
        
        // Si no se puede eliminar, es un error crítico
        if (deleteError.code !== "auth/user-not-found") {
          return res.status(500).json({
            error: "No se pudo vincular la cuenta. Por favor, intenta de nuevo",
            details: process.env.NODE_ENV === "development" ? deleteError.message : undefined,
          });
        }
      }
    }

    // PASO 7: Actualizar el usuario en Firebase Auth para incluir Google como proveedor
    // NOTA: Firebase Admin SDK no tiene un método directo para "linkWithProvider"
    // La vinculación debe hacerse desde el lado del cliente
    // Por lo tanto, aquí solo actualizamos Firestore y confiamos en que el cliente
    // hará la vinculación correcta

    // PASO 8: Actualizar Firestore
    const updateData: any = {
      provider: "password,google",
      photoURL: googleDecodedToken.picture || "",
      ultimoAcceso: new Date(),
      fechaActualizacion: new Date(),
    };

    await firestore.collection("users").doc(uid).update(updateData);
    console.log(`[LINK GOOGLE] Firestore actualizado con ambos proveedores`);

    // PASO 9: Obtener datos del usuario y generar token
    const userDoc = await firestore.collection("users").doc(uid).get();
    const userData = userDoc.data();

    const customToken = await firebaseAuth.createCustomToken(uid);

    console.log(`[LINK GOOGLE] Vinculación completada exitosamente`);

    return res.json({
      message: "Cuenta de Google vinculada exitosamente",
      token: customToken,
      user: {
        uid,
        email: userData?.email,
        nombre: userData?.nombre,
        apellido: userData?.apellido,
        role: userData?.role,
        dni: userData?.dni || null,
      },
    });
  } catch (error: any) {
    console.error("[LINK GOOGLE] Error general:", error);
    return res.status(500).json({
      error: "Error interno del servidor",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

export const updateUserDni = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const uid = req.user.uid;
    const { dni } = req.body;

    if (!dni) {
      return res.status(400).json({
        error: "DNI es requerido",
      });
    }

    // Validar formato de DNI (ajustar según tu país)
    if (typeof dni !== "string" || dni.trim().length < 7) {
      return res.status(400).json({
        error: "Formato de DNI inválido",
      });
    }

    // Verificar que el DNI no exista ya
    const existingDniQuery = await firestore
      .collection("users")
      .where("dni", "==", dni.trim())
      .get();

    if (!existingDniQuery.empty) {
      const existingUser = existingDniQuery.docs[0];
      if (existingUser.id !== uid) {
        return res.status(409).json({
          error: "Ya existe un usuario registrado con este DNI",
        });
      }
    }

    // Actualizar DNI
    await firestore.collection("users").doc(uid).update({
      dni: dni.trim(),
      fechaActualizacion: new Date(),
    });

    console.log(`[UPDATE DNI] DNI actualizado para usuario: ${uid}`);

    return res.json({
      message: "DNI actualizado exitosamente",
      dni: dni.trim(),
    });
  } catch (error: any) {
    console.error("[UPDATE DNI] Error:", error);
    return res.status(500).json({
      error: "Error interno del servidor",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
