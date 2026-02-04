import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import { firestore } from '../../config/firebase';
import { PDFDocument, rgb } from 'pdf-lib';
import QRCode from 'qrcode';
import { randomUUID } from 'crypto';
import { CertificadoData, CertificadoValidationResponse } from '../../types/certificates';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Generar certificado PDF
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

    // Validar que la formacion existe
    const cursoDoc = await firestore.collection('courses').doc(cursoId).get();
    if (!cursoDoc.exists) {
      return res.status(404).json({ error: 'Formacion no encontrada' });
    }

    const cursoData = cursoDoc.data();
    const nombreCurso = cursoData?.titulo || 'Formación';

    // Validar que el usuario tiene acceso a la formacion
    const cursosAsignados = userData?.cursos_asignados || [];
    if (!cursosAsignados.includes(cursoId)) {
      return res.status(403).json({ error: 'El usuario no tiene acceso a esta formacion' });
    }

    // Verificar que la formacion está completado (progreso 100%)
    const modulosIds = cursoData?.id_modulos || [];
    if (modulosIds.length === 0) {
      return res.status(400).json({ error: 'La formacion no tiene módulos' });
    }

    // Obtener progreso de la formacion
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
        error: 'La formacion no está completado',
        progreso: progresoGeneral,
        faltante: 100 - progresoGeneral,
      });
    }

    // Verificar si la formacion tiene examen asociado
    const examenesSnapshot = await firestore
      .collection('examenes')
      .where('id_formacion', '==', cursoId)
      .where('estado', '==', 'activo')
      .get();

    if (!examenesSnapshot.empty) {
      // La formacion tiene examen, verificar que el usuario lo haya aprobado
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


    const isProduction = process.env.FIREBASE_PROJECT_ID === 'inee-admin';
    const baseUrl = isProduction
      ? 'https://estudiante.ineeoficial.com'
      : 'https://estudiante-qa.ineeoficial.com';
    const validationUrl = `${baseUrl}/validar-certificado/${certificadoId}`;

    console.log('URL del certificado generado:', validationUrl, `(env: ${isProduction ? 'producción' : 'qa'})`);

    // Generar QR Code como Data URL
    const qrCodeDataUrl = await QRCode.toDataURL(validationUrl, {
      width: 200,
      margin: 1,
    });

    // Crear datos del certificado
    const fechaFinalizacion = new Date();
    const fechaEmision = new Date();
    
    // Determinar el tipo de certificado antes de guardar
    const tipoCertificado: 'APROBACION' | 'PARTICIPACION' = !examenesSnapshot.empty ? 'APROBACION' : 'PARTICIPACION';

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
      tipo: tipoCertificado,
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

    // Formatear fecha de finalización: "9 / Septiembre / 2026"
    const dia = fechaFinalizacion.getDate();
    const mes = fechaFinalizacion.toLocaleDateString('es-AR', { month: 'long' });
    const año = fechaFinalizacion.getFullYear();
    const mesCapitalizado = mes.charAt(0).toUpperCase() + mes.slice(1);
    const fechaFormateada = `${dia} / ${mesCapitalizado} / ${año}`;

    // Formatear fecha actual para el campo Fecha_Actual: "03/02/2026"
    const diaActual = fechaEmision.getDate().toString().padStart(2, '0');
    const mesActual = (fechaEmision.getMonth() + 1).toString().padStart(2, '0');
    const añoActual = fechaEmision.getFullYear();
    const fechaActual = `${diaActual}/${mesActual}/${añoActual}`;

    // Determinar qué PDF usar según si tiene examen o no
    const tieneExamen = !examenesSnapshot.empty;
    const pdfFileName = tieneExamen ? 'APROBACION.pdf' : 'PARTICIPACION.pdf';

    // Leer el PDF template con campos de formulario
    // En desarrollo: __dirname = src/modules/certificates
    // En producción: __dirname = dist/modules/certificates
    const templatePath = join(__dirname, 'templates', 'pdf', pdfFileName);
    let pdfTemplateBytes: Buffer;
    
    try {
      pdfTemplateBytes = readFileSync(templatePath);
    } catch (error) {
      // Si no se encuentra en dist, intentar en src (desarrollo)
      const srcPath = templatePath.replace(/dist\//, 'src/');
      pdfTemplateBytes = readFileSync(srcPath);
    }

    // Cargar el PDF template
    const pdfDoc = await PDFDocument.load(pdfTemplateBytes);
    
    // Obtener el formulario del PDF
    const form = pdfDoc.getForm();
    
    // Convertir QR Code de Data URL a Buffer
    const qrImageBytes = Buffer.from(qrCodeDataUrl.split(',')[1], 'base64');
    
    try {
      // Rellenar los campos del formulario según los nombres que proporcionaste
      // Nombre del estudiante
      const nombreField = form.getTextField('Nombre_Estudiante');
      nombreField.setText(nombreCompleto);
      
      // DNI del estudiante
      const dniField = form.getTextField('DNI_Estudiante');
      dniField.setText(dni);
      
      // Fecha de finalización
      const fechaFinField = form.getTextField('Fecha_Finalizacion');
      fechaFinField.setText(fechaFormateada);
      
      // Nombre de la formación
      const nombreFormacionField = form.getTextField('Nombre_Formacion');
      nombreFormacionField.setText(nombreCurso);
      
      // Fecha actual
      const fechaActualField = form.getTextField('Fecha_Actual');
      fechaActualField.setText(fechaActual);
      
      // Agregar imagen QR
      // El QR debe estar embebido como PNG
      const qrImage = await pdfDoc.embedPng(qrImageBytes);
      
      // Intentar encontrar el campo QR y establecer la imagen
      let qrFieldFound = false;
      
      try {
        // Intentar como botón (PDFButton)
        const qrButton = form.getButton('QR');
        qrButton.setImage(qrImage);
        qrFieldFound = true;
        console.log('QR agregado como botón');
      } catch (buttonError) {
        // Si no funciona como botón, intentar buscar entre todos los campos
        try {
          const fields = form.getFields();
          for (const field of fields) {
            const fieldName = field.getName();
            if (fieldName === 'QR' || fieldName.toLowerCase().includes('qr')) {
              console.log(`Campo QR encontrado: ${fieldName} (${field.constructor.name})`);
              
              // Si es un botón, establecer imagen
              if (field.constructor.name === 'PDFButton') {
                (field as any).setImage(qrImage);
                qrFieldFound = true;
                break;
              }
            }
          }
        } catch (searchError) {
          console.log('No se pudo buscar campos QR:', searchError);
        }
      }
      
      // Si no se encontró el campo QR, agregarlo manualmente en la página
      if (!qrFieldFound) {
        console.log('Campo QR no encontrado, agregando imagen directamente en la página');
        
        const pages = pdfDoc.getPages();
        const firstPage = pages[0];
        
        // Tamaño del QR (ajustar según necesites)
        const qrSize = 100;
        
        // Posición: centrado horizontalmente, en la parte inferior
        // Ajusta estas coordenadas según tu diseño
        const x = (firstPage.getWidth() / 2) - (qrSize / 2);
        const y = 80; // Distancia desde el borde inferior
        
        firstPage.drawImage(qrImage, {
          x: x,
          y: y,
          width: qrSize,
          height: qrSize,
        });
        
        console.log(`QR agregado manualmente en posición (${x}, ${y})`);
      }
      
      // Aplanar el formulario para que los campos no sean editables
      form.flatten();
      
    } catch (fieldError: any) {
      console.error('Error al rellenar campos del formulario:', fieldError);
      // Listar todos los campos disponibles para debugging
      const fields = form.getFields();
      console.log('Campos disponibles en el PDF:');
      fields.forEach(field => {
        const name = field.getName();
        const type = field.constructor.name;
        console.log(`  - ${name} (${type})`);
      });
      
      return res.status(400).json({
        error: 'Error al rellenar los campos del certificado',
        details: fieldError.message,
        camposDisponibles: fields.map(f => ({ nombre: f.getName(), tipo: f.constructor.name })),
        mensaje: 'Verifica que los nombres de los campos en el PDF coincidan con los esperados'
      });
    }

    // Generar el PDF modificado
    const pdfBytes = await pdfDoc.save();

    // Configurar headers para descargar el PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="certificado-${nombreCurso.replace(/\s+/g, '-')}.pdf"`);

    // Enviar PDF al cliente
    res.send(Buffer.from(pdfBytes));
  } catch (error: any) {
    console.error('Error al generar certificado:', error);
    return res.status(500).json({
      error: 'Error interno del servidor al generar el certificado',
      details: error.message,
    });
  }
};

/**
 * Obtener PDF del certificado por ID (público)
 * GET /api/certificados/pdf/:certificadoId
 */
export const obtenerPdfCertificado = async (req: Request, res: Response) => {
  try {
    const { certificadoId } = req.params;

    if (!certificadoId) {
      return res.status(400).json({ error: 'ID de certificado requerido' });
    }

    // Buscar certificado en Firestore
    const certificadoDoc = await firestore
      .collection('certificados')
      .doc(certificadoId)
      .get();

    if (!certificadoDoc.exists) {
      return res.status(404).json({ error: 'Certificado no encontrado' });
    }

    const certificadoData = certificadoDoc.data();

    // Convertir timestamps de Firestore a Date
    const fechaFinalizacion = certificadoData?.fechaFinalizacion?.toDate() || new Date();
    const fechaEmision = certificadoData?.fechaEmision?.toDate() || new Date();

    // Formatear fechas
    const dia = fechaFinalizacion.getDate();
    const mes = fechaFinalizacion.toLocaleDateString('es-AR', { month: 'long' });
    const año = fechaFinalizacion.getFullYear();
    const mesCapitalizado = mes.charAt(0).toUpperCase() + mes.slice(1);
    const fechaFormateada = `${dia} / ${mesCapitalizado} / ${año}`;

    const diaActual = fechaEmision.getDate().toString().padStart(2, '0');
    const mesActual = (fechaEmision.getMonth() + 1).toString().padStart(2, '0');
    const añoActual = fechaEmision.getFullYear();
    const fechaActual = `${diaActual}/${mesActual}/${añoActual}`;

    // Determinar qué PDF usar
    const tipoCertificado = certificadoData?.tipo || 'PARTICIPACION';
    const pdfFileName = tipoCertificado === 'APROBACION' ? 'APROBACION.pdf' : 'PARTICIPACION.pdf';

    // Leer el PDF template
    const templatePath = join(__dirname, 'templates', 'pdf', pdfFileName);
    let pdfTemplateBytes: Buffer;
    
    try {
      pdfTemplateBytes = readFileSync(templatePath);
    } catch (error) {
      const srcPath = templatePath.replace(/dist\//, 'src/');
      pdfTemplateBytes = readFileSync(srcPath);
    }

    // Cargar el PDF
    const pdfDoc = await PDFDocument.load(pdfTemplateBytes);
    const form = pdfDoc.getForm();

    // Obtener datos del certificado
    const nombreCompleto = certificadoData?.nombreCompleto || '';
    const dni = certificadoData?.dni || '';
    const nombreCurso = certificadoData?.nombreCurso || '';
    const qrCodeDataUrl = certificadoData?.qrCodeUrl || '';

    // Convertir QR Code de Data URL a Buffer
    const qrImageBytes = Buffer.from(qrCodeDataUrl.split(',')[1], 'base64');

    try {
      // Rellenar campos
      const nombreField = form.getTextField('Nombre_Estudiante');
      nombreField.setText(nombreCompleto);
      
      const dniField = form.getTextField('DNI_Estudiante');
      dniField.setText(dni);
      
      const fechaFinField = form.getTextField('Fecha_Finalizacion');
      fechaFinField.setText(fechaFormateada);
      
      const nombreFormacionField = form.getTextField('Nombre_Formacion');
      nombreFormacionField.setText(nombreCurso);
      
      const fechaActualField = form.getTextField('Fecha_Actual');
      fechaActualField.setText(fechaActual);
      
      // Agregar QR
      const qrImage = await pdfDoc.embedPng(qrImageBytes);
      let qrFieldFound = false;
      
      try {
        const qrButton = form.getButton('QR');
        qrButton.setImage(qrImage);
        qrFieldFound = true;
      } catch (buttonError) {
        // Buscar entre todos los campos
        try {
          const fields = form.getFields();
          for (const field of fields) {
            const fieldName = field.getName();
            if (fieldName === 'QR' || fieldName.toLowerCase().includes('qr')) {
              if (field.constructor.name === 'PDFButton') {
                (field as any).setImage(qrImage);
                qrFieldFound = true;
                break;
              }
            }
          }
        } catch (searchError) {
          console.log('No se pudo buscar campos QR:', searchError);
        }
      }
      
      // Si no se encontró, agregar manualmente
      if (!qrFieldFound) {
        const pages = pdfDoc.getPages();
        const firstPage = pages[0];
        const qrSize = 100;
        const x = (firstPage.getWidth() / 2) - (qrSize / 2);
        const y = 80;
        
        firstPage.drawImage(qrImage, {
          x: x,
          y: y,
          width: qrSize,
          height: qrSize,
        });
      }
      
      // Aplanar el formulario
      form.flatten();
      
    } catch (fieldError: any) {
      console.error('Error al rellenar campos:', fieldError);
      return res.status(400).json({
        error: 'Error al rellenar los campos del certificado',
        details: fieldError.message,
      });
    }

    // Generar PDF
    const pdfBytes = await pdfDoc.save();

    // Configurar headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="certificado-${certificadoData?.nombreCurso?.replace(/\s+/g, '-')}.pdf"`);

    // Enviar PDF
    res.send(Buffer.from(pdfBytes));
  } catch (error: any) {
    console.error('Error al obtener PDF del certificado:', error);
    return res.status(500).json({
      error: 'Error interno del servidor',
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

    // Verificar que la formacion todavía existe
    const cursoDoc = await firestore
      .collection('courses')
      .doc(certificadoData?.cursoId)
      .get();

    if (!cursoDoc.exists) {
      return res.status(200).json({
        valido: false,
        mensaje: 'La formacion asociado a este certificado ya no existe',
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
        tipo: certificadoData?.tipo || 'PARTICIPACION',
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

