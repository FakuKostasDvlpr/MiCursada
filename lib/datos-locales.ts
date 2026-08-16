// Modo sin Supabase: la app lee un snapshot del aula virtual desde disco y le
// aplica encima overlays locales (lo que el usuario edita/agrega a mano).
//
// Archivos (todos en datos/, ignorado por git — son datos personales):
//   datos/aula-virtual.json      → snapshot generado desde Moodle (materias, archivos, avisos)
//   datos/horarios.json          → horarios cargados a mano { "curso:2756": [{ dia, inicio, fin }] }
//   datos/avisos-estado.json     → toggle "hecho" de cada aviso  { "assign:14782": true }
//   datos/materias-extra.json    → profe/aula/color por materia  { "curso:2756": { profe, aula, color } }
//   datos/archivos-manuales.json → archivos agregados a mano     { "curso:2756": [{ id, nombre, url }] }
//   datos/avisos-manuales.json   → avisos agregados a mano       [{ id, materiaId, titulo, fecha, hecho }]
//
// Las filas que vienen del snapshot NO se pueden borrar (las regenera el sync);
// las manuales llevan id "manual:<uuid>" para no chocar con "curso:"/"mod:"/"assign:".
//
// SOLO SERVIDOR: usa node:fs. No importar desde un client component.
// (No está el paquete `server-only` en el proyecto, así que la garantía es por convención.)

import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { COLORES_MATERIA, type Archivo, type Aviso, type Dia, type Horario, type Materia } from '@/lib/types';

/**
 * Directorio de datos. Se resuelve en cada llamada (no en el import) para que
 * los tests puedan apuntarlo a un tmpdir con CURSADA_DATOS_DIR.
 */
function dirDatos(): string {
  return process.env.CURSADA_DATOS_DIR || path.join(process.cwd(), 'datos');
}

const NOMBRES = {
  snapshot: 'aula-virtual.json',
  horarios: 'horarios.json',
  avisosEstado: 'avisos-estado.json',
  materiasExtra: 'materias-extra.json',
  archivosManuales: 'archivos-manuales.json',
  avisosManuales: 'avisos-manuales.json',
} as const;

type Overlay = keyof typeof NOMBRES;

export function rutaDatos(cual: Overlay): string {
  return path.join(dirDatos(), NOMBRES[cual]);
}

/** Prefijo de los ids generados localmente (nunca choca con los de Moodle). */
export const PREFIJO_MANUAL = 'manual:';

const nuevoId = () => `${PREFIJO_MANUAL}${randomUUID()}`;

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

/** { "curso:2756": { profe: "…", aula: "…", color: "#a78bfa" } } — solo las claves presentes pisan al snapshot. */
export const materiaExtraSchema = z.object({
  profe: z.string().optional(),
  aula: z.string().optional(),
  color: z.string().optional(),
});

export const materiasExtraArchivoSchema = z.record(z.string(), materiaExtraSchema);

export type MateriaExtra = z.infer<typeof materiaExtraSchema>;
export type MateriasExtraArchivo = z.infer<typeof materiasExtraArchivoSchema>;

/** { "curso:2756": [{ id: "manual:…", nombre: "Guía 5", url: "https://…" }] } */
export const archivoManualSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  url: z.string(),
});

export const archivosManualesArchivoSchema = z.record(
  z.string(),
  z.array(archivoManualSchema)
);

export type ArchivoManual = z.infer<typeof archivoManualSchema>;
export type ArchivosManualesArchivo = z.infer<typeof archivosManualesArchivoSchema>;

/** [{ id: "manual:…", materiaId: "curso:2756" | null, titulo, fecha, hecho }] */
export const avisoManualSchema = z.object({
  id: z.string(),
  materiaId: z.string().nullable().optional(),
  titulo: z.string(),
  fecha: z.string(),
  hecho: z.boolean().optional(),
});

export const avisosManualesArchivoSchema = z.array(avisoManualSchema);

export type AvisoManual = z.infer<typeof avisoManualSchema>;

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

type Overlays = {
  horarios: HorariosArchivo;
  estados: AvisosEstado;
  extra: MateriasExtraArchivo;
  archivos: ArchivosManualesArchivo;
  avisos: AvisoManual[];
};

function armar(snapshot: z.infer<typeof snapshotSchema>, ov: Overlays): DatosLocales {
  const materias: Materia[] = snapshot.materias
    .map((m): Materia => {
      const hs: Horario[] = (ov.horarios[m.id] ?? []).map((h) => ({
        id: idHorario(m.id, h),
        materiaId: m.id,
        dia: h.dia as Dia,
        inicio: h.inicio,
        fin: h.fin,
      }));
      hs.sort((a, b) => a.dia - b.dia || a.inicio.localeCompare(b.inicio));

      const extra = ov.extra[m.id] ?? {};
      // Color: el editado a mano gana; si no, el del snapshot; si no, uno estable por id.
      const colorCrudo = esColor(extra.color) ? extra.color : m.color;

      const archivosSnapshot: Archivo[] = (m.archivos ?? []).map((a) => ({
        id: a.id,
        materiaId: a.materiaId ?? m.id,
        nombre: a.nombre,
        url: a.url,
      }));
      const archivosManuales: Archivo[] = (ov.archivos[m.id] ?? []).map((a) => ({
        id: a.id,
        materiaId: m.id,
        nombre: a.nombre,
        url: a.url,
      }));

      return {
        id: m.id,
        nombre: m.nombre,
        profe: extra.profe ?? m.profe ?? '',
        aula: extra.aula ?? m.aula ?? '',
        color: esColor(colorCrudo) ? colorCrudo : colorDeId(m.id),
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
        archivos: [...archivosSnapshot, ...archivosManuales],
      };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  // El "hecho" de TODOS los avisos (del snapshot y manuales) vive en
  // avisos-estado.json — así toggleAviso es una sola ruta para los dos casos.
  const avisos: Aviso[] = [...snapshot.avisos, ...ov.avisos]
    .map((a) => ({
      id: a.id,
      materiaId: a.materiaId ?? null,
      titulo: a.titulo,
      fecha: a.fecha,
      hecho: ov.estados[a.id] ?? a.hecho ?? false,
    }))
    .sort((x, y) => x.fecha.localeCompare(y.fecha));

  return { generado: snapshot.generado ?? null, materias, avisos };
}

/**
 * Datos del snapshot + overlays locales. Cacheado en memoria; se relee solo
 * si cambió el mtime de alguno de los archivos.
 */
export async function getDatosLocales(): Promise<DatosLocales> {
  const rutaSnapshot = rutaDatos('snapshot');
  const overlays: Overlay[] = [
    'horarios',
    'avisosEstado',
    'materiasExtra',
    'archivosManuales',
    'avisosManuales',
  ];

  const [mSnap, ...mOverlays] = await Promise.all([
    mtime(rutaSnapshot),
    ...overlays.map((o) => mtime(rutaDatos(o))),
  ]);
  const clave = [rutaSnapshot, mSnap, ...mOverlays].join('|');
  if (cache && cache.clave === clave) return cache.datos;

  if (mSnap === 0) {
    if (!avisoSinSnapshot) {
      avisoSinSnapshot = true;
      console.warn(
        `No hay snapshot del aula virtual en ${rutaSnapshot} — la app arranca vacía.`
      );
    }
    cache = { clave, datos: VACIO };
    return VACIO;
  }

  const [crudoSnap, crudoHor, crudoEst, crudoExtra, crudoArch, crudoAvisos] = await Promise.all([
    leerJson(rutaSnapshot),
    leerJson(rutaDatos('horarios')),
    leerJson(rutaDatos('avisosEstado')),
    leerJson(rutaDatos('materiasExtra')),
    leerJson(rutaDatos('archivosManuales')),
    leerJson(rutaDatos('avisosManuales')),
  ]);

  const snap = snapshotSchema.safeParse(crudoSnap);
  if (!snap.success) {
    console.warn('El snapshot del aula virtual no tiene el formato esperado:', snap.error.message);
    cache = { clave, datos: VACIO };
    return VACIO;
  }

  const hor = horariosArchivoSchema.safeParse(crudoHor ?? {});
  const est = avisosEstadoSchema.safeParse(crudoEst ?? {});
  const extra = materiasExtraArchivoSchema.safeParse(crudoExtra ?? {});
  const arch = archivosManualesArchivoSchema.safeParse(crudoArch ?? {});
  const avm = avisosManualesArchivoSchema.safeParse(crudoAvisos ?? []);

  const datos = armar(snap.data, {
    horarios: hor.success ? hor.data : {},
    estados: est.success ? est.data : {},
    extra: extra.success ? extra.data : {},
    archivos: arch.success ? arch.data : {},
    avisos: avm.success ? avm.data : [],
  });
  cache = { clave, datos };
  return datos;
}

// --- Escritura de los overlays locales ---
// Todas siguen el mismo patrón: leer → mergear → escribir el archivo entero.
// App de un solo usuario, así que no hay locking; la última escritura gana.

async function escribirJson(ruta: string, valor: unknown): Promise<void> {
  await fs.mkdir(path.dirname(ruta), { recursive: true });
  await fs.writeFile(ruta, `${JSON.stringify(valor, null, 2)}\n`, 'utf8');
  cache = null; // el mtime cambia igual, pero no dependemos de la resolución del reloj
}

/** Lee un overlay y lo valida; si no existe o está roto devuelve el fallback. */
async function leerOverlay<T>(cual: Overlay, schema: z.ZodType<T>, fallback: T): Promise<T> {
  const crudo = await leerJson(rutaDatos(cual));
  if (crudo === null) return fallback;
  const parsed = schema.safeParse(crudo);
  return parsed.success ? parsed.data : fallback;
}

/** Mergea los horarios de una materia en datos/horarios.json. */
export async function escribirHorariosLocales(
  materiaId: string,
  horarios: HorarioLocal[]
): Promise<void> {
  const mapa = { ...(await leerOverlay('horarios', horariosArchivoSchema, {})) };
  if (horarios.length === 0) delete mapa[materiaId];
  else mapa[materiaId] = horarios;
  await escribirJson(rutaDatos('horarios'), mapa);
}

/** Mergea el "hecho" de un aviso en datos/avisos-estado.json. */
export async function escribirEstadoAviso(avisoId: string, hecho: boolean): Promise<void> {
  const mapa = { ...(await leerOverlay('avisosEstado', avisosEstadoSchema, {})) };
  mapa[avisoId] = hecho;
  await escribirJson(rutaDatos('avisosEstado'), mapa);
}

/** Mergea profe/aula/color de una materia en datos/materias-extra.json. */
export async function escribirMateriaExtra(
  materiaId: string,
  extra: MateriaExtra
): Promise<void> {
  const mapa = { ...(await leerOverlay('materiasExtra', materiasExtraArchivoSchema, {})) };
  mapa[materiaId] = { ...mapa[materiaId], ...extra };
  await escribirJson(rutaDatos('materiasExtra'), mapa);
}

/** Agrega un archivo manual a datos/archivos-manuales.json. Devuelve su id. */
export async function crearArchivoLocal(
  materiaId: string,
  archivo: { nombre: string; url: string }
): Promise<string> {
  const mapa = { ...(await leerOverlay('archivosManuales', archivosManualesArchivoSchema, {})) };
  const id = nuevoId();
  mapa[materiaId] = [...(mapa[materiaId] ?? []), { id, nombre: archivo.nombre, url: archivo.url }];
  await escribirJson(rutaDatos('archivosManuales'), mapa);
  return id;
}

/** Borra un archivo manual. False si ese id no es manual (o ya no existe). */
export async function eliminarArchivoLocal(id: string): Promise<boolean> {
  const mapa = { ...(await leerOverlay('archivosManuales', archivosManualesArchivoSchema, {})) };
  let encontrado = false;
  for (const [materiaId, lista] of Object.entries(mapa)) {
    const filtrada = lista.filter((a) => a.id !== id);
    if (filtrada.length === lista.length) continue;
    encontrado = true;
    if (filtrada.length === 0) delete mapa[materiaId];
    else mapa[materiaId] = filtrada;
  }
  if (!encontrado) return false;
  await escribirJson(rutaDatos('archivosManuales'), mapa);
  return true;
}

/** Agrega un aviso manual a datos/avisos-manuales.json. Devuelve su id. */
export async function crearAvisoLocal(aviso: {
  materiaId: string | null;
  titulo: string;
  fecha: string;
}): Promise<string> {
  const lista = [...(await leerOverlay('avisosManuales', avisosManualesArchivoSchema, []))];
  const id = nuevoId();
  lista.push({
    id,
    materiaId: aviso.materiaId,
    titulo: aviso.titulo,
    fecha: aviso.fecha,
    hecho: false,
  });
  await escribirJson(rutaDatos('avisosManuales'), lista);
  return id;
}

/** Borra un aviso manual (y su estado). False si ese id no es manual. */
export async function eliminarAvisoLocal(id: string): Promise<boolean> {
  const lista = await leerOverlay('avisosManuales', avisosManualesArchivoSchema, []);
  const filtrada = lista.filter((a) => a.id !== id);
  if (filtrada.length === lista.length) return false;
  await escribirJson(rutaDatos('avisosManuales'), filtrada);

  const estados = { ...(await leerOverlay('avisosEstado', avisosEstadoSchema, {})) };
  if (id in estados) {
    delete estados[id];
    await escribirJson(rutaDatos('avisosEstado'), estados);
  }
  return true;
}
