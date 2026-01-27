import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import { firestore } from '../../config/firebase';
import QRCode from 'qrcode';
import { randomUUID } from 'crypto';
import { CertificadoData, CertificadoValidationResponse } from '../../types/certificates';

/**
 * Generar certificado (devuelve datos para que el frontend genere el PDF)
 * POST /api/certificados/generar/:cursoId
 */
export const generarCertificado = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user.uid;
    const { cursoId } = req.params;

    // Validar que el usuario existe
    const userDoc = await firestore.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const userData = userDoc.data();
    const nombreCompleto = `${userData?.nombre || ''} ${userData?.apellido || ''}`.trim();
    const dni = userData?.dni || '';

    if (!nombreCompleto || !dni) {
      return res.status(400).json({ error: 'El usuario no tiene nombre o DNI completos' });
    }

    // Validar que el curso existe
    const cursoDoc = await firestore.collection('courses').doc(cursoId).get();
    if (!cursoDoc.exists) {
      return res.status(404).json({ error: 'Curso no encontrado' });
    }

    const cursoData = cursoDoc.data();
    const nombreCurso = cursoData?.titulo || 'Curso';

    // Validar que el usuario tiene acceso al curso
    const cursosAsignados = userData?.cursos_asignados || [];
    if (!cursosAsignados.includes(cursoId)) {
      return res.status(403).json({ error: 'El usuario no tiene acceso a este curso' });
    }

    // Verificar que el curso está completado (progreso 100%)
    const modulosIds = cursoData?.id_modulos || [];
    if (modulosIds.length === 0) {
      return res.status(400).json({ error: 'El curso no tiene módulos' });
    }

    // Obtener progreso del curso
    let totalContenidos = 0;
    let contenidosCompletados = 0;

    for (const moduloId of modulosIds) {
      const moduloDoc = await firestore.collection('modulos').doc(moduloId).get();
      if (!moduloDoc.exists) continue;

      const moduloData = moduloDoc.data();
      const contenidosModulo = moduloData?.contenido || [];
      // Excluir contenido_extra del conteo
      const contenidosValidos = contenidosModulo.filter((c: any) => c.tipo_contenido !== 'contenido_extra');
      totalContenidos += contenidosValidos.length;

      // Obtener progreso del módulo
      const progresoModuloRef = firestore
        .collection('users')
        .doc(userId)
        .collection('progreso_modulos')
        .doc(moduloId);

      const progresoModuloDoc = await progresoModuloRef.get();
      if (progresoModuloDoc.exists) {
        const progresoData = progresoModuloDoc.data();
        const completados = progresoData?.contenidos_completados || [];
        // Filtrar solo los contenidos completados que no son contenido_extra
        const contenidosCompletadosValidos = completados.filter((id: string) => {
          const index = parseInt(id, 10);
          if (isNaN(index) || index < 0 || index >= contenidosModulo.length) return false;
          const contenido = contenidosModulo[index];
          return contenido && contenido.tipo_contenido !== "contenido_extra";
        });
        contenidosCompletados += contenidosCompletadosValidos.length;
      }
    }

    const progresoGeneral = totalContenidos > 0
      ? Math.round((contenidosCompletados / totalContenidos) * 100)
      : 0;

    if (progresoGeneral < 100) {
      return res.status(400).json({
        error: 'El curso no está completado',
        progreso: progresoGeneral,
        faltante: 100 - progresoGeneral,
      });
    }

    // Verificar si el curso tiene examen asociado
    const examenesSnapshot = await firestore
      .collection('examenes')
      .where('id_formacion', '==', cursoId)
      .where('estado', '==', 'activo')
      .get();

    if (!examenesSnapshot.empty) {
      // El curso tiene examen, verificar que el usuario lo haya aprobado
      const examenesRealizadosSnapshot = await firestore
        .collection('examenes_realizados')
        .where('id_usuario', '==', userId)
        .where('id_formacion', '==', cursoId)
        .where('aprobado', '==', true)
        .get();

      if (examenesRealizadosSnapshot.empty) {
        return res.status(400).json({
          error: 'Debes aprobar el examen final para obtener el certificado',
          requiereExamen: true,
        });
      }
    }

    // Generar ID único para el certificado
    const certificadoId = randomUUID();

    // Crear URL de validación pública
    const baseUrl = 'https://estudiante-qa.ineeoficial.com';
    const validationUrl = `${baseUrl}/validar-certificado/${certificadoId}`;
    
    console.log('URL del certificado generado:', validationUrl);

    // Generar QR Code como Data URL
    const qrCodeDataUrl = await QRCode.toDataURL(validationUrl, {
      width: 200,
      margin: 1,
    });

    // Crear datos del certificado
    const fechaFinalizacion = new Date();
    const fechaEmision = new Date();

    const certificadoData: CertificadoData = {
      certificadoId,
      usuarioId: userId,
      cursoId,
      nombreCompleto,
      dni,
      nombreCurso,
      fechaFinalizacion,
      fechaEmision,
      qrCodeUrl: qrCodeDataUrl,
      validationUrl,
    };

    // Guardar certificado en Firestore
    await firestore
      .collection('certificados')
      .doc(certificadoId)
      .set({
        ...certificadoData,
        fechaFinalizacion: fechaFinalizacion,
        fechaEmision: fechaEmision,
      });

    // Formatear fecha de finalización para el texto principal: "9 / Septiembre / 2026"
    const dia = fechaFinalizacion.getDate();
    const mes = fechaFinalizacion.toLocaleDateString('es-AR', { month: 'long' });
    const año = fechaFinalizacion.getFullYear();
    const mesCapitalizado = mes.charAt(0).toUpperCase() + mes.slice(1);
    const fechaFormateada = `${dia} / ${mesCapitalizado} / ${año}`;

    // Formatear fecha para el QR: "22/09/2026"
    const diaQR = fechaFinalizacion.getDate().toString().padStart(2, '0');
    const mesQR = (fechaFinalizacion.getMonth() + 1).toString().padStart(2, '0');
    const añoQR = fechaFinalizacion.getFullYear();
    const fechaQR = `${diaQR}/${mesQR}/${añoQR}`;

    // Devolver datos del certificado para que el frontend genere el PDF
    return res.status(201).json({
      message: 'Certificado generado correctamente',
      certificado: {
        ...certificadoData,
        fechaFinalizacionTexto: fechaFormateada,
        fechaQR,
      },
    });
  } catch (error: any) {
    console.error('Error al generar certificado:', error);
    return res.status(500).json({
      error: 'Error interno del servidor al generar el certificado',
      details: error.message,
    });
  }
};

/**
 * Validar certificado (público)
 * GET /api/certificados/validar/:certificadoId
 */
export const validarCertificado = async (req: Request, res: Response) => {
  try {
    const { certificadoId } = req.params;

    if (!certificadoId) {
      return res.status(400).json({
        valido: false,
        mensaje: 'ID de certificado requerido',
      });
    }

    // Buscar certificado en Firestore
    const certificadoDoc = await firestore
      .collection('certificados')
      .doc(certificadoId)
      .get();

    if (!certificadoDoc.exists) {
      return res.status(200).json({
        valido: false,
        mensaje: 'Certificado no encontrado',
      });
    }

    const certificadoData = certificadoDoc.data();

    // Convertir timestamps de Firestore a Date
    const fechaFinalizacion = certificadoData?.fechaFinalizacion?.toDate() || new Date();
    const fechaEmision = certificadoData?.fechaEmision?.toDate() || new Date();

    // Verificar que el curso todavía existe
    const cursoDoc = await firestore
      .collection('courses')
      .doc(certificadoData?.cursoId)
      .get();

    if (!cursoDoc.exists) {
      return res.status(200).json({
        valido: false,
        mensaje: 'El curso asociado a este certificado ya no existe',
      });
    }

    const cursoData = cursoDoc.data();

    // Verificar que el usuario todavía existe
    const userDoc = await firestore
      .collection('users')
      .doc(certificadoData?.usuarioId)
      .get();

    if (!userDoc.exists) {
      return res.status(200).json({
        valido: false,
        mensaje: 'El usuario asociado a este certificado ya no existe',
      });
    }

    const userData = userDoc.data();
    const nombreCompleto = `${userData?.nombre || ''} ${userData?.apellido || ''}`.trim();

    // Construir respuesta de validación
    const response: CertificadoValidationResponse = {
      valido: true,
      mensaje: 'Certificado válido',
      certificado: {
        certificadoId: certificadoDoc.id,
        usuarioId: certificadoData?.usuarioId || '',
        cursoId: certificadoData?.cursoId || '',
        nombreCompleto: certificadoData?.nombreCompleto || nombreCompleto,
        dni: certificadoData?.dni || '',
        nombreCurso: certificadoData?.nombreCurso || cursoData?.titulo || '',
        fechaFinalizacion,
        fechaEmision,
        qrCodeUrl: certificadoData?.qrCodeUrl || '',
        validationUrl: certificadoData?.validationUrl || '',
      },
    };

    return res.status(200).json(response);
  } catch (error: any) {
    console.error('Error al validar certificado:', error);
    return res.status(500).json({
      valido: false,
      mensaje: 'Error interno del servidor al validar el certificado',
      details: error.message,
    });
  }
};

