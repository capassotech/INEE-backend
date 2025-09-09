

export interface Course {
    titulo: string;
    descripcion: string;
    duracion: number;
    nivel: string;
    modalidad: string;
    pilar: TipoPilar;
    precio: number;
}

export type TipoPilar = "consultoria-estrategica" | "liderazgo" | "emprendimiento";