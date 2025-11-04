import { Request, Response } from 'express';
import { firestore } from '../../config/firebase';
import { 
  MembershipUpdateData,
  MembershipId,
} from '../../types/membership';

interface TypedRequest<T = any> extends Request {
  body: T;
  params: MembershipId;
}


export const getMembership = async (req: Request, res: Response) => {
  try {
    const membershipCollection = await firestore.collection('membresias').get();
    
    const memberships = membershipCollection.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return res.status(200).json({
      success: true,
      data: memberships,
      count: memberships.length
    });
  } catch (error) {
    console.error('Error fetching memberships:', error);
    return res.status(500).json({
      error: 'Error interno del servidor al obtener las membresías'
    });
  }
};

export const getMembershipById = async (req: TypedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const membershipDoc = await firestore.collection('membresias').doc(id).get();

    if (!membershipDoc.exists) {
      return res.status(404).json({
        error: 'Membresía no encontrada'
      });
    }

    const membership = {
      id: membershipDoc.id,
      ...membershipDoc.data()
    };

    return res.status(200).json({
      success: true,
      data: membership
    });
  } catch (error) {
    console.error('Error fetching membership by ID:', error);
    return res.status(500).json({
      error: 'Error interno del servidor al obtener la membresía'
    });
  }
};

export const updateMembership = async (req: TypedRequest<MembershipUpdateData>, res: Response) => {
  try {
    const { id } = req.params;
    const { nombre, descripcion, precio, informacionAdicional } = req.body;

    const membershipDoc = await firestore.collection('membresias').doc(id).get();
    
    if (!membershipDoc.exists) {
      return res.status(404).json({
        error: 'Membresía no encontrada'
      });
    }

    // Construir objeto de actualización solo con los campos proporcionados
    const updatePayload: Partial<MembershipUpdateData> & { fechaActualizacion: Date } = {
      fechaActualizacion: new Date()
    };

    if (nombre !== undefined) updatePayload.nombre = nombre;
    if (descripcion !== undefined) updatePayload.descripcion = descripcion;
    if (precio !== undefined) updatePayload.precio = precio;
    if (informacionAdicional !== undefined) updatePayload.informacionAdicional = informacionAdicional;

    await membershipDoc.ref.update(updatePayload);
    
    const updatedDoc = await firestore.collection('membresias').doc(id).get();
    const updatedMembership = {
      id: updatedDoc.id,
      ...updatedDoc.data()
    };

    return res.status(200).json({
      success: true,
      message: 'Membresía actualizada exitosamente',
      data: updatedMembership
    });
  } catch (error) {
    console.error('Error updating membership:', error);
    return res.status(500).json({
      error: 'Error interno del servidor al actualizar la membresía'
    });
  }
};
