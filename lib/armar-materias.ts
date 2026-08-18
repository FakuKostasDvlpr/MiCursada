// Arma los tipos de dominio a partir de las filas del esquema compartido.
// Puro a propósito: se testea sin Supabase.

import type {
  Aviso,
  ColorMateria,
  Dia,
  EstadoBloque,
  FormatoBloque,
  Materia,
  RefBloque,
  TipoBloque,
} from '@/lib/types';

export type CursoRow = { id: string; nombre: string; datos: Record<string, unknown> };
export type ExtraRow = { curso_id: string; profe: string; aula: string; color: string };
export type HorarioRow = { id: string; curso_id: string; dia: number; inicio: string; fin: string };
export type BloqueRow = {
  id: string; curso_id: string; tipo: string; texto: string; url: string;
  estado: string; hecho: boolean; orden: number; created_at: string;
  /** jsonb opcionales del diseño del 17/08; null en filas anteriores. */
  fmt: FormatoBloque | null; ref: RefBloque | null;
};
export type ArchivoManualRow = { id: string; curso_id: string; nombre: string; url: string };
export type AvisoCursoRow = { id: string; curso_id: string | null; titulo: string; fecha: string };
export type AvisoEstadoRow = { aviso_id: string; hecho: boolean };
export type AvisoManualRow = {
  id: string; curso_id: string | null; titulo: string; fecha: string; hecho: boolean;
  /** Bloque que lo originó, si el aviso nació de una nota. */
  nota_id: string | null;
};

const aHHMM = (t: string) => t.slice(0, 5);

export function armarMaterias(
  cursos: CursoRow[],
  extras: ExtraRow[],
  horarios: HorarioRow[],
  bloques: BloqueRow[],
  archivosManuales: ArchivoManualRow[]
): Materia[] {
  const porCurso = <T extends { curso_id: string }>(filas: T[]) => {
    const m = new Map<string, T[]>();
    for (const f of filas) {
      const lista = m.get(f.curso_id) ?? [];
      lista.push(f);
      m.set(f.curso_id, lista);
    }
    return m;
  };
  const ex = new Map(extras.map((e) => [e.curso_id, e]));
  const hs = porCurso(horarios);
  const bs = porCurso(bloques);
  const am = porCurso(archivosManuales);

  return cursos
    .map((c) => {
      const d = c.datos as {
        nombre?: string; source?: string; asistenciaUrl?: string; claseUrl?: string;
        secciones?: Materia['secciones'];
        archivos?: { id: string; nombre: string; url: string }[];
      };
      const e = ex.get(c.id);
      return {
        id: c.id,
        nombre: d.nombre ?? c.nombre,
        profe: e?.profe ?? '',
        aula: e?.aula ?? '',
        color: (e?.color ?? '#38bdf8') as ColorMateria,
        source: 'moodle' as const,
        ...(d.asistenciaUrl ? { asistenciaUrl: d.asistenciaUrl } : {}),
        ...(d.claseUrl ? { claseUrl: d.claseUrl } : {}),
        ...(d.secciones ? { secciones: d.secciones } : {}),
        horarios: (hs.get(c.id) ?? []).map((h) => ({
          id: h.id, materiaId: c.id, dia: h.dia as Dia,
          inicio: aHHMM(h.inicio), fin: aHHMM(h.fin),
        })),
        bloques: (bs.get(c.id) ?? [])
          .sort((a, b) => a.orden - b.orden)
          .map((b) => ({
            id: b.id, materiaId: c.id, tipo: b.tipo as TipoBloque, texto: b.texto,
            url: b.url, estado: b.estado as EstadoBloque, hecho: b.hecho,
            orden: b.orden, createdAt: b.created_at,
            ...(b.fmt ? { fmt: b.fmt } : {}),
            ...(b.ref ? { ref: b.ref } : {}),
          })),
        archivos: [
          ...(d.archivos ?? []).map((a) => ({ ...a, materiaId: c.id })),
          ...(am.get(c.id) ?? []).map((a) => ({
            id: a.id, materiaId: c.id, nombre: a.nombre, url: a.url,
          })),
        ],
      };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

export function armarAvisos(
  deCurso: AvisoCursoRow[],
  estados: AvisoEstadoRow[],
  manuales: AvisoManualRow[]
): Aviso[] {
  const hecho = new Map(estados.map((e) => [e.aviso_id, e.hecho]));
  return [
    ...deCurso.map((a) => ({
      id: a.id, materiaId: a.curso_id, titulo: a.titulo,
      fecha: a.fecha, hecho: hecho.get(a.id) ?? false, notaId: null,
    })),
    ...manuales.map((a) => ({
      id: a.id, materiaId: a.curso_id, titulo: a.titulo, fecha: a.fecha, hecho: a.hecho,
      notaId: a.nota_id ?? null,
    })),
  ].sort((a, b) => a.fecha.localeCompare(b.fecha));
}
