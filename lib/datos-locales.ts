// Modo sin Supabase: la app lee un snapshot del aula virtual desde disco.
//
// Archivos (todos en datos/, ignorado por git — son datos personales):
//   datos/aula-virtual.json  → snapshot generado desde Moodle (materias, archivos, avisos)
//   datos/horarios.json      → horarios cargados a mano { "curso:2756": [{ dia, inicio, fin }] }
//   datos/avisos-estado.json → toggle "hecho" de cada aviso  { "assign:14782": true }
//
// SOLO SERVIDOR: usa node:fs. No importar desde un client component.
// (No está el paquete `server-only` en el proyecto, así que la garantía es por convención.)

import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { COLORES_MATERIA, type Aviso, type Dia, type Horario, type Materia } from '@/lib/types';

const DIR_DATOS = path.join(process.cwd(), 'datos');
export const RUTA_SNAPSHOT = path.join(DIR_DATOS, 'aula-virtual.json');
export const RUTA_HORARIOS = path.join(DIR_DATOS, 'horarios.json');
export const RUTA_AVISOS_ESTADO = path.join(DIR_DATOS, 'avisos-estado.json');

// --- Schemas (laxos: lo que no reconocemos se descarta, no se rompe) ---

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const archivoSchema = z.object({
  id: z.string(),
  materiaId: z.string().optional(),
  nombre: z.string(),
  url: z.string(),
});

const bloqueSchema = z.object({
  id: z.string(),
  materiaId: z.string().optional(),
  tipo: z.string().optional(),
  texto: z.string().optional(),
  url: z.string().optional(),
  estado: z.string().optional(),
  hecho: z.boolean().optional(),
  orden: z.number().optional(),
  createdAt: z.string().optional(),
});

const materiaSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  profe: z.string().optional(),
  aula: z.string().optional(),
  color: z.string().optional(),
  source: z.string().optional(),
  archivos: z.array(archivoSchema).optional(),
  bloques: z.array(bloqueSchema).optional(),
});

const avisoSchema = z.object({
  id: z.string(),
  materiaId: z.string().nullable().optional(),
  titulo: z.string(),
  fecha: z.string(),
  hecho: z.boolean().optional(),
});

const snapshotSchema = z.object({
  generado: z.string().optional(),
  materias: z.array(materiaSchema).default([]),
  avisos: z.array(avisoSchema).default([]),
});

/** { "curso:2756": [{ dia: 4, inicio: "19:50", fin: "21:30" }] } */
export const horarioLocalSchema = z.object({
  dia: z.number().int().min(1).max(6),
  inicio: z.string().regex(HHMM),
  fin: z.string().regex(HHMM),
});

export const horariosArchivoSchema = z.record(z.string(), z.array(horarioLocalSchema));

export type HorarioLocal = z.infer<typeof horarioLocalSchema>;
export type HorariosArchivo = z.infer<typeof horariosArchivoSchema>;

/** { "assign:14782": true } */
export const avisosEstadoSchema = z.record(z.string(), z.boolean());
export type AvisosEstado = z.infer<typeof avisosEstadoSchema>;

// --- Lectura con caché por mtime ---

export type DatosLocales = {
  /** ISO del campo `generado` del snapshot, o null si no hay snapshot. */
  generado: string | null;
  materias: Materia[];
  avisos: Aviso[];
};

const VACIO: DatosLocales = { generado: null, materias: [], avisos: [] };

type Cache = { clave: string; datos: DatosLocales };
let cache: Cache | null = null;
let avisoSinSnapshot = false;

/** mtime en ms de un archivo, o 0 si no existe. */
async function mtime(ruta: string): Promise<number> {
  try {
    return (await fs.stat(ruta)).mtimeMs;
  } catch {
    return 0;
  }
}

/** Lee y parsea un JSON; null si no existe o está roto. */
async function leerJson(ruta: string): Promise<unknown> {
  try {
    return JSON.parse(await fs.readFile(ruta, 'utf8'));
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err?.code !== 'ENOENT') console.warn(`No se pudo leer ${ruta}:`, err?.message ?? e);
    return null;
  }
}

function esColor(c: string | undefined): c is Materia['color'] {
  return (COLORES_MATERIA as readonly string[]).includes(c ?? '');
}

/** Color estable derivado del id cuando el snapshot no trae uno válido. */
function colorDeId(id: string): Materia['color'] {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORES_MATERIA[h % COLORES_MATERIA.length]!;
}

/** Id determinístico para el horario (no hay DB que lo genere). */
const idHorario = (materiaId: string, h: HorarioLocal) =>
  `${materiaId}#${h.dia}#${h.inicio}-${h.fin}`;

function armar(
  snapshot: z.infer<typeof snapshotSchema>,
  horarios: HorariosArchivo,
  estados: AvisosEstado
): DatosLocales {
  const materias: Materia[] = snapshot.materias
    .map((m): Materia => {
      const hs: Horario[] = (horarios[m.id] ?? []).map((h) => ({
        id: idHorario(m.id, h),
        materiaId: m.id,
        dia: h.dia as Dia,
        inicio: h.inicio,
        fin: h.fin,
      }));
      hs.sort((a, b) => a.dia - b.dia || a.inicio.localeCompare(b.inicio));

      return {
        id: m.id,
        nombre: m.nombre,
        profe: m.profe ?? '',
        aula: m.aula ?? '',
        color: esColor(m.color) ? m.color : colorDeId(m.id),
        source: m.source === 'manual' ? 'manual' : 'moodle',
        horarios: hs,
        bloques: (m.bloques ?? []).map((b, i) => ({
          id: b.id,
          materiaId: b.materiaId ?? m.id,
          tipo:
            b.tipo === 'titulo' || b.tipo === 'tarea' || b.tipo === 'link' || b.tipo === 'divisor'
              ? b.tipo
              : 'texto',
          texto: b.texto ?? '',
          url: b.url ?? '',
          estado:
            b.estado === 'proceso' || b.estado === 'listo' ? b.estado : 'pendiente',
          hecho: b.hecho ?? false,
          orden: b.orden ?? (i + 1) * 1000,
          createdAt: b.createdAt ?? snapshot.generado ?? new Date(0).toISOString(),
        })),
        archivos: (m.archivos ?? []).map((a) => ({
          id: a.id,
          materiaId: a.materiaId ?? m.id,
          nombre: a.nombre,
          url: a.url,
        })),
      };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  const avisos: Aviso[] = snapshot.avisos
    .map((a) => ({
      id: a.id,
      materiaId: a.materiaId ?? null,
      titulo: a.titulo,
      fecha: a.fecha,
      hecho: estados[a.id] ?? a.hecho ?? false,
    }))
    .sort((x, y) => x.fecha.localeCompare(y.fecha));

  return { generado: snapshot.generado ?? null, materias, avisos };
}

/**
 * Datos del snapshot + overlays locales. Cacheado en memoria; se relee solo
 * si cambió el mtime de alguno de los tres archivos.
 */
export async function getDatosLocales(): Promise<DatosLocales> {
  const [mSnap, mHor, mEst] = await Promise.all([
    mtime(RUTA_SNAPSHOT),
    mtime(RUTA_HORARIOS),
    mtime(RUTA_AVISOS_ESTADO),
  ]);
  const clave = `${mSnap}|${mHor}|${mEst}`;
  if (cache && cache.clave === clave) return cache.datos;

  if (mSnap === 0) {
    if (!avisoSinSnapshot) {
      avisoSinSnapshot = true;
      console.warn(
        `No hay snapshot del aula virtual en ${RUTA_SNAPSHOT} — la app arranca vacía.`
      );
    }
    cache = { clave, datos: VACIO };
    return VACIO;
  }

  const [crudoSnap, crudoHor, crudoEst] = await Promise.all([
    leerJson(RUTA_SNAPSHOT),
    leerJson(RUTA_HORARIOS),
    leerJson(RUTA_AVISOS_ESTADO),
  ]);

  const snap = snapshotSchema.safeParse(crudoSnap);
  if (!snap.success) {
    console.warn('El snapshot del aula virtual no tiene el formato esperado:', snap.error.message);
    cache = { clave, datos: VACIO };
    return VACIO;
  }

  const hor = horariosArchivoSchema.safeParse(crudoHor ?? {});
  const est = avisosEstadoSchema.safeParse(crudoEst ?? {});

  const datos = armar(
    snap.data,
    hor.success ? hor.data : {},
    est.success ? est.data : {}
  );
  cache = { clave, datos };
  return datos;
}

// --- Escritura de los overlays locales ---

async function escribirJson(ruta: string, valor: unknown): Promise<void> {
  await fs.mkdir(DIR_DATOS, { recursive: true });
  await fs.writeFile(ruta, `${JSON.stringify(valor, null, 2)}\n`, 'utf8');
  cache = null; // el mtime cambia igual, pero no dependemos de la resolución del reloj
}

/** Mergea los horarios de una materia en datos/horarios.json. */
export async function escribirHorariosLocales(
  materiaId: string,
  horarios: HorarioLocal[]
): Promise<void> {
  const crudo = await leerJson(RUTA_HORARIOS);
  const actual = horariosArchivoSchema.safeParse(crudo ?? {});
  const mapa: HorariosArchivo = actual.success ? { ...actual.data } : {};
  if (horarios.length === 0) delete mapa[materiaId];
  else mapa[materiaId] = horarios;
  await escribirJson(RUTA_HORARIOS, mapa);
}

/** Mergea el "hecho" de un aviso en datos/avisos-estado.json. */
export async function escribirEstadoAviso(avisoId: string, hecho: boolean): Promise<void> {
  const crudo = await leerJson(RUTA_AVISOS_ESTADO);
  const actual = avisosEstadoSchema.safeParse(crudo ?? {});
  const mapa: AvisosEstado = actual.success ? { ...actual.data } : {};
  mapa[avisoId] = hecho;
  await escribirJson(RUTA_AVISOS_ESTADO, mapa);
}
