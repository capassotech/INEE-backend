import { firestore } from "../../config/firebase";
import { Request, Response } from "express";



export const getQuestions = async (req: Request, res: Response) => {
    try {
        const questions = await firestore.collection('preguntas').get();
        return res.json(questions.docs.map(doc => doc.data()));
    } catch (error) {
        console.error('getQuestions error:', error);
        return res.status(500).json({ error: 'Error al obtener preguntas' });
    }
}

export const getRespuestas = async (req: Request, res: Response) => {
    try {
        const respuestas = await firestore.collection('respuestas').get();
        return res.json(respuestas.docs.map(doc => doc.data()));
    } catch (error) {
        console.error('getRespuestas error:', error);
        return res.status(500).json({ error: 'Error al obtener respuestas' });
    }
}

export const getPreguntaById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const pregunta = await firestore.collection('preguntas').doc(id).get();

        const respuestas = [];

        for (const id_pregunta of pregunta.data()?.id_respuestas) {
            const respuesta = await firestore.collection('respuestas').doc(id_pregunta).get();
            respuestas.push(respuesta.data());
        }

        return res.json({
            ...pregunta.data(),
            respuestas: respuestas
        });
    } catch (error) {
        console.error('getPreguntaById error:', error);
        return res.status(500).json({ error: 'Error al obtener pregunta' });
    }
}

export const getRespuestaById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const respuesta = await firestore.collection('respuestas').doc(id).get();
        return res.json(respuesta.data());
    } catch (error) {
        console.error('getRespuestaById error:', error);
        return res.status(500).json({ error: 'Error al obtener respuesta' });
    }
}

export const testVocacional = async (req: any, res: Response) => {
    const { uid, responses }: { uid: string, responses: string[] } = req.body;
    if (!uid || !responses) {
      return res.status(400).json({ error: 'Datos inválidos' });
    }
  
    if (responses.length > 5) {
      return res.status(400).json({ error: 'Cantidad de respuestas inválida' });
    }
  
    const userDoc = await firestore.collection('users').doc(uid).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
  
    let counterA = 0;
    let counterB = 0;
    let counterC = 0;
    for (const response of responses) {
      if (response.toLowerCase() === 'a') counterA++;
      else if (response.toLowerCase() === 'b') counterB++;
      else if (response.toLowerCase() === 'c') counterC++;
    }
  
    let rutaAprendizaje: string;
    if (counterA > counterB && counterA > counterC) rutaAprendizaje = 'consultoria';
    else if (counterB > counterA && counterB > counterC) rutaAprendizaje = 'liderazgo';
    else if (counterC > counterA && counterC > counterB) rutaAprendizaje = 'emprendimiento';
    else if (counterA === counterB) rutaAprendizaje = 'consultor-lider';
    else if (counterB === counterC) rutaAprendizaje = 'lider-emprendedor';
    else if (counterC === counterA) rutaAprendizaje = 'emprendedor-consultor';
    else rutaAprendizaje = 'consultoria'; 
  
    await userDoc.ref.update({ ruta_aprendizaje: rutaAprendizaje });
  
    const ruta = await firestore.collection('rutas_aprendizaje').doc(rutaAprendizaje).get();
    
    return res.status(200).json({ 
      success: true,
      ruta: {
        id: ruta.id,
        ...ruta.data()
      }
    });
  }