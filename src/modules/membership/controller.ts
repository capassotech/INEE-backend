import { Request, Response } from 'express';
import { firestore } from '../../config/firebase';
import { 
  MembershipCreationData, 
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

    console.log(`Found ${memberships.length} memberships`);

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

export const createMembership = async (req: TypedRequest<MembershipCreationData>, res: Response) => {
  try {
    const membershipData = req.body; 
    const now = new Date();

    const newMembership = {
      ...membershipData,
      fechaCreacion: now,
      fechaActualizacion: now
    };

    const membershipRef = await firestore.collection('membresias').add(newMembership);
    

    const createdDoc = await membershipRef.get();
    const createdMembership = {
      id: createdDoc.id,
      ...createdDoc.data()
    };

    console.log(`Created membership: ${membershipData.nombre} (ID: ${membershipRef.id})`);

    return res.status(201).json({
      success: true,
      message: 'Membresía creada exitosamente',
      data: createdMembership
    });
  } catch (error) {
    console.error('Error creating membership:', error);
    return res.status(500).json({
      error: 'Error interno del servidor al crear la membresía'
    });
  }
};

export const updateMembership = async (req: TypedRequest<MembershipUpdateData>, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const membershipDoc = await firestore.collection('membresias').doc(id).get();
    
    if (!membershipDoc.exists) {
      return res.status(404).json({
        error: 'Membresía no encontrada'
      });
    }

    const updatedData = {
      ...updateData,
      fechaActualizacion: new Date()
    };

    await membershipDoc.ref.update(updatedData);
    
    const updatedDoc = await firestore.collection('membresias').doc(id).get();
    const updatedMembership = {
      id: updatedDoc.id,
      ...updatedDoc.data()
    };

    console.log(`Updated membership: ${id}`);

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

export const deleteMembership = async (req: TypedRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    const membershipDoc = await firestore.collection('membresias').doc(id).get();
    
    if (!membershipDoc.exists) {
      return res.status(404).json({
        error: 'Membresía no encontrada'
      });
    }

    await membershipDoc.ref.delete();

    console.log(`Deleted membership: ${id}`);

    return res.status(200).json({
      success: true,
      message: 'Membresía eliminada exitosamente'
    });
  } catch (error) {
    console.error('Error deleting membership:', error);
    return res.status(500).json({
      error: 'Error interno del servidor al eliminar la membresía'
    });
  }
};


