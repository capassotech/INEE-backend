import { firestore, storage, firebaseApp } from "../../config/firebase";
import { Request, Response } from "express";
import { ValidatedModule, ValidatedUpdateModule } from "../../types/modules";
import axios from "axios";

const saveThumbnailToStorage = async (urlMiniatura: string): Promise<string> => {
    // Verificar si la URL ya es de Firebase Storage (no descargar de nuevo)
    if (urlMiniatura.includes('storage.googleapis.com') || urlMiniatura.startsWith('gs://')) {
        return urlMiniatura;
    }

    // Validar que la URL sea válida
    if (!urlMiniatura || typeof urlMiniatura !== 'string' || urlMiniatura.trim() === '') {
        throw new Error('La URL de la miniatura no es válida');
    }

    // Validar formato de URL básico
    try {
        new URL(urlMiniatura);
    } catch {
        throw new Error('La URL no tiene un formato válido');
    }

    try {
        // Descargar la imagen desde la URL
        const response = await axios.get(urlMiniatura, {
            responseType: 'arraybuffer',
            timeout: 30000,
            maxRedirects: 5,
        });

        // Validar que el Content-Type sea una imagen
        const contentType = response.headers['content-type'] || '';
        const isImage = contentType.startsWith('image/') || 
                       contentType.includes('image/jpeg') || 
                       contentType.includes('image/png') || 
                       contentType.includes('image/gif') || 
                       contentType.includes('image/webp');
        
        if (!isImage && contentType) {
            // Si el Content-Type no es una imagen, probablemente es HTML o texto
            throw new Error(`La URL no apunta a una imagen. Content-Type recibido: ${contentType}. Por favor, usa una URL directa a una imagen (ej: .jpg, .png, .gif, .webp)`);
        }

        // Determinar la extensión del archivo desde el Content-Type
        let extension = 'jpg';
        if (contentType.includes('png')) extension = 'png';
        else if (contentType.includes('gif')) extension = 'gif';
        else if (contentType.includes('webp')) extension = 'webp';
        else if (contentType.includes('jpeg')) extension = 'jpg';
        
        // Generar un nombre único para el archivo
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 15);
        const fileName = `miniaturas/${timestamp}_${random}.${extension}`;

        // Usar el bucket por defecto de la app
        const bucket = storage.bucket();
        const file = bucket.file(fileName);

        // Subir el archivo a Storage
        await file.save(Buffer.from(response.data), {
            metadata: {
                contentType: contentType || 'image/jpeg',
            },
        });

        // Hacer el archivo público
        await file.makePublic();

        // Retornar la URL pública del archivo
        return `https://storage.googleapis.com/${bucket.name}/${fileName}`;
    } catch (error: any) {
        // Si es un error de conexión/URL inválida, lanzar error descriptivo
        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            throw new Error(`No se pudo acceder a la URL: ${urlMiniatura}`);
        }
        if (error.response?.status === 404) {
            throw new Error(`La URL no se encontró (404): ${urlMiniatura}. Verifica que la URL sea correcta y accesible.`);
        }
        if (error.response?.status >= 400 && error.response?.status < 500) {
            throw new Error(`Error del servidor (${error.response.status}): La URL no es accesible o no es válida.`);
        }
        // Si el error ya tiene un mensaje descriptivo (como el de Content-Type), usarlo
        if (error.message && error.message.includes('Content-Type')) {
            throw error;
        }
        // Re-lanzar el error original
        throw error;
    }
};

export const getBackModules = async (req: Request, res: Response) => {
    try {
        const limit = Math.min(parseInt(req.query.limit as string || '20'), 100); // Máximo 100
        const lastId = req.query.lastId as string | undefined;
        
        let query = firestore.collection('modulos')
            .orderBy('__name__') // Ordenar por ID del documento
            .limit(limit);
        
        // Si hay un lastId, continuar desde ahí
        if (lastId) {
            const lastDoc = await firestore.collection('modulos').doc(lastId).get();
            if (lastDoc.exists) {
                query = query.startAfter(lastDoc);
            }
        }
        
        const snapshot = await query.get();
        
        if (snapshot.empty) {
            return res.json({
                modules: [],
                pagination: {
                    hasMore: false,
                    lastId: null,
                    limit,
                    count: 0
                }
            });
        }
        
        const modules = snapshot.docs.map((doc) => ({ 
            id: doc.id, 
            ...doc.data() 
        }));
        
        const lastDoc = snapshot.docs[snapshot.docs.length - 1];
        const hasMore = snapshot.docs.length === limit;
        
        return res.json({
            modules,
            pagination: {
                hasMore,
                lastId: lastDoc?.id,
                limit,
                count: modules.length
            }
        });
    } catch (error) {
        console.error('getBackModules error:', error);
        return res.status(500).json({ error: 'Error al obtener módulos' });
    }
}

export const getBackModuleById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const backModule = await firestore.collection('modulos').doc(id).get();
        
        if (!backModule.exists) {
            return res.status(404).json({ error: 'Módulo no encontrado' });
        }
        
        res.json({ id: backModule.id, ...backModule.data() });
    } catch (error) {
        console.error('getBackModuleById error:', error);
        res.status(500).json({ error: 'Error al obtener módulo' });
    }
}

export const createBackModule = async (req: Request, res: Response) => {
    try {
        const moduleData: ValidatedModule = req.body;

        console.log('moduleData', moduleData);
        
        const cursoExists = await firestore.collection('courses').doc(moduleData.id_curso).get();
        if (!cursoExists.exists) {
            return res.status(404).json({ error: 'El curso especificado no existe' });
        }

        // Procesar miniaturas: guardar en Storage si hay URLs
        const processedContent = await Promise.all(
            moduleData.contenido.map(async (content) => {
                if (content.url_miniatura) {
                    try {
                        const storagePath = await saveThumbnailToStorage(content.url_miniatura);
                        console.log('storagePath', storagePath);
                        return {
                            ...content,
                            url_miniatura: storagePath
                        };
                    } catch (error: any) {
                        console.error('Error al procesar miniatura:', error?.message || error);
                        // Si falla, mantener la URL original si parece válida, sino null
                        // Si la URL ya es de Firebase Storage, mantenerla
                        const isFirebaseUrl = content.url_miniatura.includes('storage.googleapis.com') || 
                                            content.url_miniatura.startsWith('gs://');
                        return {
                            ...content,
                            url_miniatura: isFirebaseUrl ? content.url_miniatura : null
                        };
                    }
                }
                return content;
            })
        );

        const newModule = await firestore.collection('modulos').add({
            ...moduleData,
            contenido: processedContent,
            fechaCreacion: new Date(),
            fechaActualizacion: new Date()
        });

        await firestore.collection('courses').doc(moduleData.id_curso).update({
            id_modulos: [...cursoExists.data()?.id_modulos, newModule.id]
        });
        
        res.status(201).json({ 
            id: newModule.id, 
            message: 'Módulo creado exitosamente' 
        });
    } catch (error) {
        console.error('createBackModule error:', error);
        res.status(500).json({ error: 'Error al crear módulo' });
    }
}   

export const updateBackModule = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const updateData: ValidatedUpdateModule = req.body;

        console.log('updateData', updateData);
        
        const moduleExists = await firestore.collection('modulos').doc(id).get();
        if (!moduleExists.exists) {
            return res.status(404).json({ error: 'Módulo no encontrado' });
        }
        
        const cursoExists = await firestore.collection('courses').doc(updateData.id_curso || '').get();
        if (updateData.id_curso) {
            if (!cursoExists.exists) {
                return res.status(404).json({ error: 'El curso especificado no existe' });
            }
        }
        
        // Procesar miniaturas si hay contenido en la actualización
        let processedUpdateData = { ...updateData };
        if (updateData.contenido && Array.isArray(updateData.contenido)) {
            const processedContent = await Promise.all(
                updateData.contenido.map(async (content) => {
                    if (content.url_miniatura) {
                        try {
                            const storagePath = await saveThumbnailToStorage(content.url_miniatura);
                            console.log('storagePath', storagePath);
                            return {
                                ...content,
                                url_miniatura: storagePath
                            };
                        } catch (error: any) {
                            console.error('Error al procesar miniatura:', error?.message || error);
                            // Si falla, mantener la URL original si parece válida, sino null
                            // Si la URL ya es de Firebase Storage, mantenerla
                            const isFirebaseUrl = content.url_miniatura.includes('storage.googleapis.com') || 
                                                content.url_miniatura.startsWith('gs://');
                            return {
                                ...content,
                                url_miniatura: isFirebaseUrl ? content.url_miniatura : null
                            };
                        }
                    }
                    return content;
                })
            );
            processedUpdateData.contenido = processedContent;
        }
        
        await firestore.collection('modulos').doc(id).update({
            ...processedUpdateData,
            fechaActualizacion: new Date()
        });
        

        const currentModules = cursoExists.data()?.id_modulos || [];
        const updatedModules = currentModules.includes(id) 
            ? currentModules 
            : [...currentModules, id];
            
        await firestore.collection('courses').doc(updateData.id_curso || '').update({
            id_modulos: updatedModules
        });

        res.json({ 
            message: 'Módulo actualizado exitosamente',
            id: id 
        });
    } catch (error) {
        console.error('updateBackModule error:', error);
        res.status(500).json({ error: 'Error al actualizar módulo' });
    }
}

export const deleteBackModule = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        
        const moduleExists = await firestore.collection('modulos').doc(id).get();
        if (!moduleExists.exists) {
            return res.status(404).json({ error: 'Módulo no encontrado' });
        }
        
        const courseRef = await firestore.collection('courses').doc(moduleExists.data()?.id_curso).get();
        const currentModules = courseRef.data()?.id_modulos || [];
        
        await firestore.collection('courses').doc(moduleExists.data()?.id_curso).update({
            id_modulos: currentModules.filter((moduleId: string) => moduleId !== id)
        });
        
        await firestore.collection('modulos').doc(id).delete();
        res.json({ message: 'Módulo eliminado correctamente' });
    } catch (error) {
        console.error('deleteBackModule error:', error);
        res.status(500).json({ error: 'Error al eliminar módulo' });
    }
}