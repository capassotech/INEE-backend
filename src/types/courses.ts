

export interface Course {
    titulo: string;
    descripcion: string;
    duracion: number;
    nivel: string;
    modalidad: string;
    pilar: TipoPilar;
    precio: number;
    imagen: string;
    id_profesor: string;
    estado: string;
    tags: string[];
    id_modulos: string[];
}

export type TipoPilar = "consultoria-estrategica" | "liderazgo" | "emprendimiento";