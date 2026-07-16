import { firestore } from "../../config/firebase";
import { Request, Response } from "express";
import {
    matchesSearch,
    paginateByPage,
    parseLimit,
    parsePage,
    sortByComparator,
    toJsDate,
} from "../../utils/listQuery";

export const getProfesors = async (req: Request, res: Response) => {
    try {
        const limit = parseLimit(req.query.limit as string, 20, 100);
        const lastId = req.query.lastId as string | undefined;
        const page = req.query.page ? parsePage(req.query.page as string) : undefined;
        const search = req.query.search as string | undefined;
        const status = req.query.status as string | undefined;
        const sortBy = req.query.sortBy as string | undefined;

        const hasStatusFilter = Boolean(status && status !== 'all');
        const hasAdvancedFilters = Boolean(search?.trim() || hasStatusFilter || sortBy || page);

        if (!hasAdvancedFilters) {
            // Paginación por cursor (comportamiento original, usado por la tienda)
            const extendedQuery = lastId
                ? firestore.collection('profesores').orderBy('__name__').startAfter(await firestore.collection('profesores').doc(lastId).get()).limit(limit + 1)
                : firestore.collection('profesores').orderBy('__name__').limit(limit + 1);

            const snapshot = await extendedQuery.get();

            const docs = snapshot.docs.slice(0, limit);
            const profesors = docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            return res.json({
                profesors,
                pagination: {
                    hasMore: snapshot.docs.length > limit,
                    lastId: docs[docs.length - 1]?.id ?? null,
                    limit,
                    count: profesors.length
                }
            });
        }

        const snapshot = await firestore.collection('profesores').orderBy('__name__').limit(1000).get();
        let profesors: Array<Record<string, unknown> & { id: string }> = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        profesors = profesors.filter((profesor) =>
            matchesSearch(search, [
                `${String(profesor.nombre || '')} ${String(profesor.apellido || '')}`,
            ])
        );

        if (hasStatusFilter) {
            const isActive = status === 'activo';
            // Los profesores sin campo `activo` se consideran habilitados
            profesors = profesors.filter(
                (profesor) => Boolean(profesor.activo ?? true) === isActive
            );
        }

        profesors = sortByComparator(
            profesors,
            sortBy,
            sortBy === 'date' ? 'desc' : 'asc',
            {
                name: (a, b) =>
                    `${String(a.nombre || '')} ${String(a.apellido || '')}`.localeCompare(
                        `${String(b.nombre || '')} ${String(b.apellido || '')}`
                    ),
                date: (a, b) =>
                    (toJsDate(a.createdAt)?.getTime() || 0) - (toJsDate(b.createdAt)?.getTime() || 0),
            },
            (a, b) => String(a.id).localeCompare(String(b.id))
        );

        const paginated = paginateByPage(profesors, page ?? 1, limit);

        return res.json({
            profesors: paginated.items,
            pagination: {
                hasMore: paginated.hasMore,
                lastId: null,
                limit,
                page: page ?? 1,
                total: paginated.total,
                totalPages: paginated.totalPages,
                count: paginated.items.length
            }
        });
    } catch (error) {
        console.error('getProfesors error:', error);
        return res.status(500).json({ error: 'Error al obtener profesores' });
    }
}

export const getProfesorById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const profesor = await firestore.collection('profesores').doc(id).get();
        if (!profesor.exists) {
            return res.status(404).json({ error: 'Profesor no encontrado' });
        }
        res.json({ id: profesor.id, ...profesor.data() });
    } catch (error) {
        console.error('getProfesorById error:', error);
        res.status(500).json({ error: 'Error al obtener profesor' });
    }
}

export const createProfesor = async (req: Request, res: Response) => {
    try {
        const bodyData = req.body;
        
        // Si el frontend envía los datos dentro de un objeto 'profesor', extraerlos
        const datosProfesor = bodyData.profesor || bodyData;
        const { nombre, apellido, photo_url } = datosProfesor;
        
        if (!nombre || !apellido) {
            return res.status(400).json({ error: 'Nombre y apellido son requeridos' });
        }
        
        const profesorData = {
            nombre,
            apellido,
            photo_url: photo_url || '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        
        const docRef = await firestore.collection('profesores').add(profesorData);
        const newProfesor = await docRef.get();
        
        res.status(201).json({ id: newProfesor.id, ...newProfesor.data() });
    } catch (error) {
        console.error('createProfesor error:', error);
        res.status(500).json({ error: 'Error al crear profesor' });
    }
}

export const updateProfesor = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const bodyData = req.body;
        
        // Si el frontend envía los datos dentro de un objeto 'profesor', extraerlos
        const datosProfesor = bodyData.profesor || bodyData;
        
        const profesorRef = firestore.collection('profesores').doc(id);
        const profesorDoc = await profesorRef.get();
        
        if (!profesorDoc.exists) {
            return res.status(404).json({ error: 'Profesor no encontrado' });
        }
        
        // Preparar datos de actualización
        const updateData: any = {
            updatedAt: new Date().toISOString(),
        };
        
        // Copiar todos los campos válidos
        // Excluir campos que no deben actualizarse directamente
        const camposExcluidos = ['id', 'createdAt'];
        
        for (const [key, value] of Object.entries(datosProfesor)) {
            // No incluir campos excluidos
            if (camposExcluidos.includes(key)) {
                continue;
            }
            
            // Incluir el campo si tiene un valor válido (incluyendo false, 0 y strings vacíos para photo_url)
            if (value !== undefined && value !== null) {
                // No copiar objetos de Firestore directamente (tienen _seconds, _nanoseconds)
                if (typeof value === 'object' && value !== null && ('_seconds' in value || '_nanoseconds' in value)) {
                    continue;
                }
                updateData[key] = value;
            }
        }
        
        await profesorRef.update(updateData);
        const updatedProfesor = await profesorRef.get();
        
        res.json({ 
            id: updatedProfesor.id, 
            ...updatedProfesor.data() 
        });
    } catch (error) {
        console.error('updateProfesor error:', error);
        res.status(500).json({ error: 'Error al actualizar profesor' });
    }
}

export const deleteProfesor = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const profesorRef = firestore.collection('profesores').doc(id);
        const profesorDoc = await profesorRef.get();
        
        if (!profesorDoc.exists) {
            return res.status(404).json({ error: 'Profesor no encontrado' });
        }
        
        await profesorRef.delete();
        res.json({ message: 'Profesor eliminado correctamente' });
    } catch (error) {
        console.error('deleteProfesor error:', error);
        res.status(500).json({ error: 'Error al eliminar profesor' });
    }
}