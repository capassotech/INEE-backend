import { Request, Response } from 'express';
import { firestore } from '../../config/firebase';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import {
  MarcarCompletadoData,
  DesmarcarCompletadoData,
  ProgresoModulo,
  ResumenProgreso,
  ResumenProgresoCurso,
  ProgresoCursoResponse,
  ProgresoModuloDetalle,
  EstadoContenidoResponse,
  CursoConProgreso,
} from '../../types/progress';

/**
 * Marcar un contenido como completado
 * POST /api/progreso/marcar-completado
 */
export const marcarCompletado = async (req: Request, res: Response) => {
  try {
    const { userId, cursoId, moduloId, contenidoId }: MarcarCompletadoData = req.body;

    // Validar que el usuario existe
    const userDoc = await firestore.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // Validar que el usuario tiene acceso al curso
    const userData = userDoc.data();
    const cursosAsignados = userData?.cursos_asignados || [];
    if (!cursosAsignados.includes(cursoId)) {
      return res.status(403).json({ error: 'El usuario no tiene acceso a este curso' });
    }

    // Validar que el curso existe
    const cursoDoc = await firestore.collection('courses').doc(cursoId).get();
    if (!cursoDoc.exists) {
      return res.status(404).json({ error: 'Curso no encontrado' });
    }

    // Validar que el módulo existe y pertenece al curso
    const moduloDoc = await firestore.collection('modulos').doc(moduloId).get();
    if (!moduloDoc.exists) {
      return res.status(404).json({ error: 'Módulo no encontrado' });
    }

    const moduloData = moduloDoc.data();
    if (moduloData?.id_curso !== cursoId) {
      return res.status(400).json({ error: 'El módulo no pertenece a este curso' });
    }

    // Validar que el contenido existe en el módulo
    const contenidos = moduloData?.contenido || [];
    const contenidoIndex = obtenerIndiceContenido(contenidos, contenidoId);

    if (contenidoIndex === -1) {
      return res.status(404).json({ error: 'Contenido no encontrado en el módulo' });
    }

    // Normalizar contenidoId al índice para consistencia
    const contenidoIdNormalizado = contenidoIndex.toString();

    // Obtener o crear el documento de progreso del módulo
    const progresoRef = firestore
      .collection('users')
      .doc(userId)
      .collection('progreso_modulos')
      .doc(moduloId);

    const progresoDoc = await progresoRef.get();
    const now = new Date();

    if (progresoDoc.exists) {
      const progresoData = progresoDoc.data() as ProgresoModulo;
      const contenidosCompletados = progresoData.contenidos_completados || [];

      // Normalizar IDs existentes y verificar si ya está completado
      const contenidosNormalizados = contenidosCompletados.map(id => normalizarContenidoId(contenidos, id));
      if (contenidosNormalizados.includes(contenidoIdNormalizado)) {
        // Recalcular progreso general
        await calcularProgresoGeneral(userId, cursoId);
        
        const moduloProgreso = await obtenerProgresoModulo(userId, moduloId, cursoId);
        const progresoGeneral = await obtenerProgresoGeneral(userId, cursoId);
        
        return res.status(200).json({
          success: true,
          message: 'Contenido ya estaba completado',
          progreso: progresoGeneral,
          modulo_progreso: moduloProgreso,
        });
      }

      // Agregar el contenido a la lista de completados (usar ID normalizado)
      // Remover duplicados normalizando todos los IDs existentes
      const idsUnicos = new Set(contenidosNormalizados);
      idsUnicos.add(contenidoIdNormalizado);
      const nuevosCompletados = Array.from(idsUnicos);
      const totalContenidos = contenidos.length;
      const completado = nuevosCompletados.length === totalContenidos;

      await progresoRef.update({
        contenidos_completados: nuevosCompletados,
        completado,
        fecha_actualizacion: now,
      });
    } else {
      // Crear nuevo documento de progreso
      const nuevoProgreso: ProgresoModulo = {
        modulo_id: moduloId,
        curso_id: cursoId,
        contenidos_completados: [contenidoIdNormalizado],
        completado: contenidos.length === 1,
        fecha_actualizacion: now,
      };

      await progresoRef.set(nuevoProgreso);
    }

    // Recalcular progreso general del curso
    const progresoGeneral = await calcularProgresoGeneral(userId, cursoId);
    const moduloProgreso = await obtenerProgresoModulo(userId, moduloId, cursoId);

    return res.status(200).json({
      success: true,
      message: 'Contenido marcado como completado',
      progreso: progresoGeneral,
      modulo_progreso: moduloProgreso,
    });
  } catch (error) {
    console.error('Error al marcar contenido como completado:', error);
    return res.status(500).json({
      error: 'Error interno del servidor al marcar contenido como completado',
    });
  }
};

/**
 * Desmarcar un contenido como completado
 * POST /api/progreso/desmarcar-completado
 */
export const desmarcarCompletado = async (req: Request, res: Response) => {
  try {
    const { userId, cursoId, moduloId, contenidoId }: DesmarcarCompletadoData = req.body;

    // Validar que el usuario existe
    const userDoc = await firestore.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // Validar que el módulo existe
    const moduloDoc = await firestore.collection('modulos').doc(moduloId).get();
    if (!moduloDoc.exists) {
      return res.status(404).json({ error: 'Módulo no encontrado' });
    }

    const moduloData = moduloDoc.data();
    const contenidos = moduloData?.contenido || [];

    // Obtener el documento de progreso del módulo
    const progresoRef = firestore
      .collection('users')
      .doc(userId)
      .collection('progreso_modulos')
      .doc(moduloId);

    const progresoDoc = await progresoRef.get();

    if (!progresoDoc.exists) {
      return res.status(404).json({ error: 'No hay progreso registrado para este módulo' });
    }

    const progresoData = progresoDoc.data() as ProgresoModulo;
    const contenidosCompletados = progresoData.contenidos_completados || [];

    // Normalizar contenidoId
    const contenidoIndex = obtenerIndiceContenido(contenidos, contenidoId);
    if (contenidoIndex === -1) {
      return res.status(404).json({ error: 'Contenido no encontrado en el módulo' });
    }
    const contenidoIdNormalizado = contenidoIndex.toString();

    // Normalizar IDs existentes y verificar si está completado
    const contenidosNormalizados = contenidosCompletados.map(id => normalizarContenidoId(contenidos, id));
    if (!contenidosNormalizados.includes(contenidoIdNormalizado)) {
      const progresoGeneral = await obtenerProgresoGeneral(userId, cursoId);
      return res.status(200).json({
        success: true,
        message: 'Contenido no estaba completado',
        progreso: progresoGeneral,
      });
    }

    // Remover el contenido de la lista de completados (usar ID normalizado)
    const nuevosCompletados = contenidosNormalizados.filter((id) => id !== contenidoIdNormalizado);
    const completado = false; // Si se desmarca, el módulo ya no está completado

    await progresoRef.update({
      contenidos_completados: nuevosCompletados,
      completado,
      fecha_actualizacion: new Date(),
    });

    // Recalcular progreso general del curso
    const progresoGeneral = await calcularProgresoGeneral(userId, cursoId);

    return res.status(200).json({
      success: true,
      message: 'Contenido desmarcado como completado',
      progreso: progresoGeneral,
    });
  } catch (error) {
    console.error('Error al desmarcar contenido como completado:', error);
    return res.status(500).json({
      error: 'Error interno del servidor al desmarcar contenido como completado',
    });
  }
};

/**
 * Obtener progreso de un curso
 * GET /api/progreso/curso/:cursoId
 */
export const obtenerProgresoCurso = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user.uid;
    const { cursoId } = req.params;

    // Validar que el curso existe
    const cursoDoc = await firestore.collection('courses').doc(cursoId).get();
    if (!cursoDoc.exists) {
      return res.status(404).json({ error: 'Curso no encontrado' });
    }

    const cursoData = cursoDoc.data();
    const modulosIds = cursoData?.id_modulos || [];

    if (modulosIds.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          progreso_general: 0,
          total_contenidos: 0,
          contenidos_completados: 0,
          modulos: [],
        },
      });
    }

    // Obtener todos los módulos del curso
    const modulosPromises = modulosIds.map((moduloId: string) =>
      firestore.collection('modulos').doc(moduloId).get()
    );
    const modulosDocs = await Promise.all(modulosPromises);

    // Obtener progreso de cada módulo
    const modulosDetalle: ProgresoModuloDetalle[] = [];
    let totalContenidos = 0;
    let contenidosCompletados = 0;

    for (const moduloDoc of modulosDocs) {
      if (!moduloDoc.exists) continue;

      const moduloData = moduloDoc.data();
      const moduloId = moduloDoc.id;
      const contenidosModulo = moduloData?.contenido || [];
      // Excluir contenido_extra del cálculo
      const contenidosValidos = contenidosModulo.filter((c: any) => c.tipo_contenido !== "contenido_extra");
      const totalContenidosModulo = contenidosValidos.length;
      totalContenidos += totalContenidosModulo;

      // Obtener progreso del módulo
      const progresoModuloRef = firestore
        .collection('users')
        .doc(userId)
        .collection('progreso_modulos')
        .doc(moduloId);

      const progresoModuloDoc = await progresoModuloRef.get();
      let contenidosCompletadosModulo = 0;
      let completado = false;

      if (progresoModuloDoc.exists) {
        const progresoData = progresoModuloDoc.data() as ProgresoModulo;
        const contenidosCompletadosIds = progresoData.contenidos_completados || [];
        
        // Filtrar solo los contenidos completados que no son contenido_extra
        contenidosCompletadosModulo = contenidosCompletadosIds.filter((id: string) => {
          const index = parseInt(id, 10);
          if (isNaN(index) || index < 0 || index >= contenidosModulo.length) return false;
          const contenido = contenidosModulo[index];
          return contenido && contenido.tipo_contenido !== "contenido_extra";
        }).length;
        
        completado = progresoData.completado || false;
      }

      contenidosCompletados += contenidosCompletadosModulo;

      const progresoModulo = totalContenidosModulo > 0
        ? Math.round((contenidosCompletadosModulo / totalContenidosModulo) * 100)
        : 0;

      modulosDetalle.push({
        modulo_id: moduloId,
        nombre: moduloData?.titulo || 'Sin título',
        progreso: progresoModulo,
        contenidos_totales: totalContenidosModulo,
        contenidos_completados: contenidosCompletadosModulo,
        completado,
      });
    }

    const progresoGeneral = totalContenidos > 0
      ? Math.round((contenidosCompletados / totalContenidos) * 100)
      : 0;

    const respuesta: ProgresoCursoResponse = {
      progreso_general: progresoGeneral,
      total_contenidos: totalContenidos,
      contenidos_completados: contenidosCompletados,
      modulos: modulosDetalle,
    };

    return res.status(200).json({
      success: true,
      data: respuesta,
    });
  } catch (error) {
    console.error('Error al obtener progreso del curso:', error);
    return res.status(500).json({
      error: 'Error interno del servidor al obtener progreso del curso',
    });
  }
};

/**
 * Obtener estado de un contenido específico
 * GET /api/progreso/contenido/:moduloId/:contenidoId
 */
export const obtenerEstadoContenido = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user.uid;
    const { moduloId, contenidoId } = req.params;

    // Validar que el módulo existe
    const moduloDoc = await firestore.collection('modulos').doc(moduloId).get();
    if (!moduloDoc.exists) {
      return res.status(404).json({ error: 'Módulo no encontrado' });
    }

    const moduloData = moduloDoc.data();
    const contenidos = moduloData?.contenido || [];

    // Obtener progreso del módulo
    const progresoRef = firestore
      .collection('users')
      .doc(userId)
      .collection('progreso_modulos')
      .doc(moduloId);

    const progresoDoc = await progresoRef.get();

    if (!progresoDoc.exists) {
      return res.status(200).json({
        success: true,
        data: {
          completado: false,
          fecha_completado: null,
        },
      });
    }

    const progresoData = progresoDoc.data() as ProgresoModulo;
    const contenidosCompletados = progresoData.contenidos_completados || [];
    
    // Normalizar contenidoId
    const contenidoIndex = obtenerIndiceContenido(contenidos, contenidoId);
    const contenidoIdNormalizado = contenidoIndex !== -1 ? contenidoIndex.toString() : contenidoId;
    
    // Normalizar IDs existentes
    const contenidosNormalizados = contenidosCompletados.map(id => normalizarContenidoId(contenidos, id));
    const completado = contenidosNormalizados.includes(contenidoIdNormalizado);

    const respuesta: EstadoContenidoResponse = {
      completado,
      fecha_completado: completado ? progresoData.fecha_actualizacion : null,
    };

    return res.status(200).json({
      success: true,
      data: respuesta,
    });
  } catch (error) {
    console.error('Error al obtener estado del contenido:', error);
    return res.status(500).json({
      error: 'Error interno del servidor al obtener estado del contenido',
    });
  }
};

/**
 * Listar cursos del usuario con progreso
 * GET /api/progreso/mis-cursos
 */
export const listarMisCursos = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user.uid;

    // Obtener datos del usuario
    const userDoc = await firestore.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const userData = userDoc.data();
    const cursosAsignados = userData?.cursos_asignados || [];
    const resumenProgreso = (userData?.resumen_progreso || {}) as ResumenProgreso;

    if (cursosAsignados.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
      });
    }

    // Obtener información de cada curso
    const cursosPromises = cursosAsignados.map((cursoId: string) =>
      firestore.collection('courses').doc(cursoId).get()
    );
    const cursosDocs = await Promise.all(cursosPromises);

    const cursosConProgreso: CursoConProgreso[] = [];

    for (const cursoDoc of cursosDocs) {
      if (!cursoDoc.exists) continue;

      const cursoData = cursoDoc.data();
      const cursoId = cursoDoc.id;
      const progresoCurso = resumenProgreso[cursoId];

      cursosConProgreso.push({
        id: cursoId,
        titulo: cursoData?.titulo || 'Sin título',
        descripcion: cursoData?.descripcion || '',
        imagen: cursoData?.imagen || '',
        progreso: progresoCurso?.progreso || 0,
        contenidos_completados: progresoCurso?.contenidos_completados || 0,
        total_contenidos: progresoCurso?.total_contenidos || 0,
        ultima_actividad: progresoCurso?.ultima_actividad || null,
      });
    }

    return res.status(200).json({
      success: true,
      data: cursosConProgreso,
    });
  } catch (error) {
    console.error('Error al listar cursos del usuario:', error);
    return res.status(500).json({
      error: 'Error interno del servidor al listar cursos del usuario',
    });
  }
};

/**
 * Función helper: Calcular progreso general de un curso
 */
export async function calcularProgresoGeneral(userId: string, cursoId: string): Promise<ResumenProgresoCurso> {
  try {
    // Obtener el curso
    const cursoDoc = await firestore.collection('courses').doc(cursoId).get();
    if (!cursoDoc.exists) {
      throw new Error('Curso no encontrado');
    }

    const cursoData = cursoDoc.data();
    const modulosIds = cursoData?.id_modulos || [];

    if (modulosIds.length === 0) {
      const resumen: ResumenProgresoCurso = {
        progreso: 0,
        contenidos_completados: 0,
        total_contenidos: 0,
        ultima_actividad: new Date(),
      };

      await actualizarResumenProgreso(userId, cursoId, resumen);
      return resumen;
    }

    // Obtener todos los módulos del curso
    const modulosPromises = modulosIds.map((moduloId: string) =>
      firestore.collection('modulos').doc(moduloId).get()
    );
    const modulosDocs = await Promise.all(modulosPromises);

    let totalContenidos = 0;
    let contenidosCompletados = 0;
    let ultimaActividad: Date | null = null;

    for (const moduloDoc of modulosDocs) {
      if (!moduloDoc.exists) continue;

      const moduloData = moduloDoc.data();
      const moduloId = moduloDoc.id;
      const contenidosModulo = moduloData?.contenido || [];
      // Excluir contenido_extra del cálculo
      const contenidosValidos = contenidosModulo.filter((c: any) => c.tipo_contenido !== "contenido_extra");
      totalContenidos += contenidosValidos.length;

      // Obtener progreso del módulo
      const progresoModuloRef = firestore
        .collection('users')
        .doc(userId)
        .collection('progreso_modulos')
        .doc(moduloId);

      const progresoModuloDoc = await progresoModuloRef.get();

      if (progresoModuloDoc.exists) {
        const progresoData = progresoModuloDoc.data() as ProgresoModulo;
        const contenidosCompletadosIds = progresoData.contenidos_completados || [];
        
        // Filtrar solo los contenidos completados que no son contenido_extra
        const contenidosCompletadosValidos = contenidosCompletadosIds.filter((id: string) => {
          const index = parseInt(id, 10);
          if (isNaN(index) || index < 0 || index >= contenidosModulo.length) return false;
          const contenido = contenidosModulo[index];
          return contenido && contenido.tipo_contenido !== "contenido_extra";
        });
        
        contenidosCompletados += contenidosCompletadosValidos.length;

        // Actualizar última actividad si es más reciente
        const fechaActualizacion = progresoData.fecha_actualizacion;
        if (fechaActualizacion) {
          const fecha = fechaActualizacion instanceof Date
            ? fechaActualizacion
            : (fechaActualizacion as any).toDate();
          
          if (!ultimaActividad || fecha > ultimaActividad) {
            ultimaActividad = fecha;
          }
        }
      }
    }

    const progreso = totalContenidos > 0
      ? Math.round((contenidosCompletados / totalContenidos) * 100)
      : 0;

    const resumen: ResumenProgresoCurso = {
      progreso,
      contenidos_completados: contenidosCompletados,
      total_contenidos: totalContenidos,
      ultima_actividad: ultimaActividad || new Date(),
    };

    // Actualizar resumen en el documento del usuario
    await actualizarResumenProgreso(userId, cursoId, resumen);

    return resumen;
  } catch (error) {
    console.error('Error al calcular progreso general:', error);
    throw error;
  }
}

/**
 * Función helper: Actualizar resumen de progreso en el documento del usuario
 */
async function actualizarResumenProgreso(
  userId: string,
  cursoId: string,
  resumen: ResumenProgresoCurso
): Promise<void> {
  const userRef = firestore.collection('users').doc(userId);
  const userDoc = await userRef.get();

  if (!userDoc.exists) {
    throw new Error('Usuario no encontrado');
  }

  const userData = userDoc.data();
  const resumenProgreso = (userData?.resumen_progreso || {}) as ResumenProgreso;

  resumenProgreso[cursoId] = resumen;

  await userRef.update({
    resumen_progreso: resumenProgreso,
    fechaActualizacion: new Date(),
  });
}

/**
 * Función helper: Obtener progreso de un módulo específico
 */
async function obtenerProgresoModulo(
  userId: string,
  moduloId: string,
  cursoId: string
): Promise<ProgresoModuloDetalle | null> {
  const moduloDoc = await firestore.collection('modulos').doc(moduloId).get();
  if (!moduloDoc.exists) {
    return null;
  }

  const moduloData = moduloDoc.data();
  const contenidosModulo = moduloData?.contenido || [];
  // Excluir contenido_extra del cálculo
  const contenidosValidos = contenidosModulo.filter((c: any) => c.tipo_contenido !== "contenido_extra");
  const totalContenidosModulo = contenidosValidos.length;

  const progresoModuloRef = firestore
    .collection('users')
    .doc(userId)
    .collection('progreso_modulos')
    .doc(moduloId);

  const progresoModuloDoc = await progresoModuloRef.get();
  let contenidosCompletadosModulo = 0;
  let completado = false;

  if (progresoModuloDoc.exists) {
    const progresoData = progresoModuloDoc.data() as ProgresoModulo;
    const contenidosCompletadosIds = progresoData.contenidos_completados || [];
    
    // Filtrar solo los contenidos completados que no son contenido_extra
    contenidosCompletadosModulo = contenidosCompletadosIds.filter((id: string) => {
      const index = parseInt(id, 10);
      if (isNaN(index) || index < 0 || index >= contenidosModulo.length) return false;
      const contenido = contenidosModulo[index];
      return contenido && contenido.tipo_contenido !== "contenido_extra";
    }).length;
    
    completado = progresoData.completado || false;
  }

  const progresoModulo = totalContenidosModulo > 0
    ? Math.round((contenidosCompletadosModulo / totalContenidosModulo) * 100)
    : 0;

  return {
    modulo_id: moduloId,
    nombre: moduloData?.titulo || 'Sin título',
    progreso: progresoModulo,
    contenidos_totales: totalContenidosModulo,
    contenidos_completados: contenidosCompletadosModulo,
    completado,
  };
}

/**
 * Función helper: Obtener índice de un contenido en el array
 */
function obtenerIndiceContenido(contenidos: any[], contenidoId: string): number {
  // Intentar como índice numérico
  const indexNum = parseInt(contenidoId, 10);
  if (!isNaN(indexNum) && indexNum >= 0 && indexNum < contenidos.length) {
    return indexNum;
  }

  // Buscar por ID si existe
  const indexById = contenidos.findIndex((content: any) => content.id === contenidoId);
  if (indexById !== -1) {
    return indexById;
  }

  // Buscar por título
  const indexByTitulo = contenidos.findIndex((content: any) => content.titulo === contenidoId);
  if (indexByTitulo !== -1) {
    return indexByTitulo;
  }

  return -1;
}

/**
 * Función helper: Normalizar ID de contenido a índice
 */
function normalizarContenidoId(contenidos: any[], contenidoId: string): string {
  const index = obtenerIndiceContenido(contenidos, contenidoId);
  return index !== -1 ? index.toString() : contenidoId;
}

/**
 * Función helper: Obtener progreso general de un curso (sin recalcular)
 */
async function obtenerProgresoGeneral(userId: string, cursoId: string): Promise<ResumenProgresoCurso> {
  const userDoc = await firestore.collection('users').doc(userId).get();
  if (!userDoc.exists) {
    throw new Error('Usuario no encontrado');
  }

  const userData = userDoc.data();
  const resumenProgreso = (userData?.resumen_progreso || {}) as ResumenProgreso;
  const progresoCurso = resumenProgreso[cursoId];

  if (progresoCurso) {
    return progresoCurso;
  }

  // Si no existe, calcularlo
  return await calcularProgresoGeneral(userId, cursoId);
}

