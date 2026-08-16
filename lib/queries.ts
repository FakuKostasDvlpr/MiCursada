// Fase 3 — Lecturas para Server Components.
// Mapean filas snake_case de Supabase a los tipos de dominio (camelCase) de lib/types.ts.
// Sin cache: lecturas directas, las páginas son dynamic.

import { createClient } from '@/lib/supabase/server';
import type {
  Archivo,
  Aviso,
  Bloque,
  ColorMateria,
  Dia,
  EstadoBloque,
  Horario,
  Materia,
  Perfil,
  TipoBloque,
} from '@/lib/types';

// --- Tipos de fila (snake_case, como los devuelve PostgREST) ---

type HorarioRow = {
  id: string;
  materia_id: string;
  dia: number;
  inicio: string; // 'HH:MM:SS'
  fin: string; // 'HH:MM:SS'
};

type BloqueRow = {
  id: string;
  materia_id: string;
  tipo: string;
  texto: string;
  url: string;
  estado: string;
  hecho: boolean;
  orden: number;
  created_at: string;
};

type ArchivoRow = {
  id: string;
  materia_id: string;
  nombre: string;
  url: string;
};

type MateriaRow = {
  id: string;
  nombre: string;
  profe: string;
  aula: string;
  color: string;
  horarios: HorarioRow[];
  bloques: BloqueRow[];
  archivos: ArchivoRow[];
};

type AvisoRow = {
  id: string;
  materia_id: string | null;
  titulo: string;
  fecha: string;
  hecho: boolean;
};

type PerfilRow = {
  nombre: string;
  instituto: string | null;
  avatar_url: string | null;
};

type SyncLogRow = {
  id: string;
  corrida_at: string;
  resultado: string;
  detalle: string;
};

export type UltimaSync = {
  id: string;
  /** ISO timestamptz. */
  corridaAt: string;
  resultado: string;
  detalle: string;
};

// --- Mappers ---

/** PostgREST devuelve time como 'HH:MM:SS' → normalizamos a 'HH:MM'. */
const aHHMM = (t: string) => t.slice(0, 5);

function mapHorario(row: HorarioRow): Horario {
  return {
    id: row.id,
    materiaId: row.materia_id,
    dia: row.dia as Dia,
    inicio: aHHMM(row.inicio),
    fin: aHHMM(row.fin),
  };
}

function mapBloque(row: BloqueRow): Bloque {
  return {
    id: row.id,
    materiaId: row.materia_id,
    tipo: row.tipo as TipoBloque,
    texto: row.texto,
    url: row.url,
    estado: row.estado as EstadoBloque,
    hecho: row.hecho,
    orden: row.orden,
    createdAt: row.created_at,
  };
}

function mapArchivo(row: ArchivoRow): Archivo {
  return {
    id: row.id,
    materiaId: row.materia_id,
    nombre: row.nombre,
    url: row.url,
  };
}

function mapMateria(row: MateriaRow): Materia {
  return {
    id: row.id,
    nombre: row.nombre,
    profe: row.profe,
    aula: row.aula,
    color: row.color as ColorMateria,
    horarios: (row.horarios ?? []).map(mapHorario),
    bloques: (row.bloques ?? []).map(mapBloque),
    archivos: (row.archivos ?? []).map(mapArchivo),
  };
}

function mapAviso(row: AvisoRow): Aviso {
  return {
    id: row.id,
    materiaId: row.materia_id,
    titulo: row.titulo,
    fecha: row.fecha,
    hecho: row.hecho,
  };
}

const SELECT_MATERIA = `
  id, nombre, profe, aula, color,
  horarios ( id, materia_id, dia, inicio, fin ),
  bloques ( id, materia_id, tipo, texto, url, estado, hecho, orden, created_at ),
  archivos ( id, materia_id, nombre, url )
`;

// --- Queries ---

/** Materias del usuario con horarios, bloques (por orden) y archivos anidados. */
export async function getMaterias(): Promise<Materia[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('materias')
    .select(SELECT_MATERIA)
    .order('nombre')
    .order('orden', { referencedTable: 'bloques' })
    .order('nombre', { referencedTable: 'archivos' });

  if (error) {
    console.error('getMaterias:', error);
    throw error;
  }
  return (data as MateriaRow[]).map(mapMateria);
}

/** Una materia con todo anidado, o null si no existe. */
export async function getMateria(id: string): Promise<Materia | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('materias')
    .select(SELECT_MATERIA)
    .eq('id', id)
    .order('orden', { referencedTable: 'bloques' })
    .order('nombre', { referencedTable: 'archivos' })
    .maybeSingle();

  if (error) {
    console.error('getMateria:', error);
    throw error;
  }
  return data ? mapMateria(data as MateriaRow) : null;
}

/** Todos los avisos del usuario, ordenados por fecha ascendente. */
export async function getAvisos(): Promise<Aviso[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('avisos')
    .select('id, materia_id, titulo, fecha, hecho')
    .order('fecha', { ascending: true });

  if (error) {
    console.error('getAvisos:', error);
    throw error;
  }
  return (data as AvisoRow[]).map(mapAviso);
}

/** Perfil del usuario o null si todavía no lo creó. */
export async function getPerfil(): Promise<Perfil | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('perfil')
    .select('nombre, instituto, avatar_url')
    .maybeSingle();

  if (error) {
    console.error('getPerfil:', error);
    throw error;
  }
  if (!data) return null;
  const row = data as PerfilRow;
  return { nombre: row.nombre, instituto: row.instituto, avatarUrl: row.avatar_url };
}

/** Última corrida del scraper o null si nunca corrió. */
export async function getUltimaSync(): Promise<UltimaSync | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('sync_log')
    .select('id, corrida_at, resultado, detalle')
    .order('corrida_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('getUltimaSync:', error);
    throw error;
  }
  if (!data) return null;
  const row = data as SyncLogRow;
  return {
    id: row.id,
    corridaAt: row.corrida_at,
    resultado: row.resultado,
    detalle: row.detalle,
  };
}
