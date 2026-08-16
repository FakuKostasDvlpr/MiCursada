// Tipos de dominio de Mi Cursada — versión filas de DB (ver supabase/migrations/0001_init.sql).

/** Colores de materia del handoff (solo riel de 4px o dot de 6–8px, nunca fondos). */
export const COLORES_MATERIA = [
  '#38bdf8', // celeste
  '#a78bfa', // violeta
  '#34d399', // verde
  '#fb7185', // rosa
  '#f97316', // naranja
  '#e2e8f0', // tiza
] as const;

export type ColorMateria = (typeof COLORES_MATERIA)[number];

/** Estados del kanban de bloques. */
export const ESTADOS_BLOQUE = ['pendiente', 'proceso', 'listo'] as const;
export type EstadoBloque = (typeof ESTADOS_BLOQUE)[number];

/** Tipos de bloque del editor estilo Notion. */
export const TIPOS_BLOQUE = ['texto', 'titulo', 'tarea', 'link', 'divisor'] as const;
export type TipoBloque = (typeof TIPOS_BLOQUE)[number];

/** Día de cursada: 1=Lunes … 6=Sábado (domingo no se cursa). */
export type Dia = 1 | 2 | 3 | 4 | 5 | 6;

export type Horario = {
  id: string;
  materiaId: string;
  dia: Dia;
  /** 'HH:MM'. Ojo: PostgREST devuelve time como 'HH:MM:SS'; la capa de queries (Fase 3) normaliza a 'HH:MM'. */
  inicio: string;
  /** 'HH:MM'. Ojo: PostgREST devuelve time como 'HH:MM:SS'; la capa de queries (Fase 3) normaliza a 'HH:MM'. */
  fin: string;
};

export type Bloque = {
  id: string;
  materiaId: string;
  tipo: TipoBloque;
  texto: string;
  /** Solo para tipo 'link'. */
  url: string;
  estado: EstadoBloque;
  hecho: boolean;
  /** Huecos de 1000 para reordenar sin reescribir todo. */
  orden: number;
  /** ISO timestamptz. */
  createdAt: string;
};

export type Archivo = {
  id: string;
  materiaId: string;
  nombre: string;
  url: string;
};

/** Origen de una materia: cargada a mano o sincronizada desde el aula virtual (Moodle). */
export type SourceMateria = 'manual' | 'moodle';

export type Materia = {
  id: string;
  nombre: string;
  profe: string;
  aula: string;
  color: ColorMateria;
  /** 'moodle' = vino del sync del aula virtual (nombre readonly, no se elimina). */
  source: SourceMateria;
  horarios: Horario[];
  bloques: Bloque[];
  archivos: Archivo[];
};

export type Aviso = {
  id: string;
  /** null = aviso "General", sin materia asociada. */
  materiaId: string | null;
  titulo: string;
  /** 'YYYY-MM-DD' */
  fecha: string;
  hecho: boolean;
};

/**
 * True si una fila (archivo o aviso) la cargó el usuario a mano y por lo tanto
 * se puede borrar. Las que vienen del aula virtual tienen ids con prefijo
 * ("mod:123", "assign:14782", "curso:2756") y las regenera el sync, así que no
 * se tocan. Los ids manuales son "manual:<uuid>" en modo local y un uuid pelado
 * en modo Supabase — ninguno de los dos tiene un prefijo de Moodle.
 */
export function esManual(id: string): boolean {
  return id.startsWith('manual:') || !id.includes(':');
}

export type Perfil = {
  nombre: string;
  instituto: string | null;
  avatarUrl: string | null;
};
