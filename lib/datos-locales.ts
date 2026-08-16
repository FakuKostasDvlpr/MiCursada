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
//   datos/bloques.json           → notas del editor por materia  { "curso:2756": [{ id, tipo, texto, … }] }
//   datos/perfil.json            → perfil del usuario            { nombre, instituto, avatarUrl }
//   datos/avatar.<ext>           → la foto de perfil (la sirve app/api/avatar/route.ts)
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
import {
  COLORES_MATERIA,
  ESTADOS_BLOQUE,
  TIPOS_BLOQUE,
  type Archivo,
  type Aviso,
  type Bloque,
  type Dia,
  type EstadoBloque,
  type Horario,
  type Materia,
  type ModuloCurso,
  type Perfil,
  type Seccion,
  type TipoBloque,
} from '@/lib/types';

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
  bloques: 'bloques.json',
  perfil: 'perfil.json',
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

/** Un ítem de una unidad del curso ("mod:{cmid}" + link al aula virtual). */
const moduloCursoSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  tipo: z.string().optional(),
  url: z.string(),
  descripcion: z.string().optional(),
});

/** Una unidad del curso tal como está armada en el aula virtual. */
const seccionSchema = z.object({
  nombre: z.string().optional(),
  modulos: z.array(moduloCursoSchema).default([]),
});

const materiaSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  profe: z.string().optional(),
  aula: z.string().optional(),
  color: z.string().optional(),
  source: z.string().optional(),
  /** Los snapshots viejos no lo tienen: opcional a propósito. */
  asistenciaUrl: z.string().optional(),
  /** Ídem: los snapshots previos al sync de zoom no lo tienen. */
  claseUrl: z.string().optional(),
  /** Ídem: los snapshots previos al sync del contenido por unidades no lo tienen. */
  secciones: z.array(seccionSchema).optional(),
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

/** { "curso:2756": [{ id: "manual:…", tipo: "tarea", texto, url, estado, hecho, orden, createdAt }] } */
export const bloqueLocalSchema = z.object({
  id: z.string(),
  materiaId: z.string().optional(),
  tipo: z.enum(TIPOS_BLOQUE),
  texto: z.string().default(''),
  url: z.string().default(''),
  estado: z.enum(ESTADOS_BLOQUE).default('pendiente'),
  hecho: z.boolean().default(false),
  orden: z.number().default(0),
  createdAt: z.string().default(() => new Date(0).toISOString()),
});

export const bloquesArchivoSchema = z.record(z.string(), z.array(bloqueLocalSchema));

export type BloqueLocal = z.infer<typeof bloqueLocalSchema>;
export type BloquesArchivo = z.infer<typeof bloquesArchivoSchema>;

/** { nombre, instituto, avatarUrl } — el perfil del usuario en modo local. */
export const perfilArchivoSchema = z.object({
  nombre: z.string(),
  instituto: z.string().nullable().default(null),
  avatarUrl: z.string().nullable().default(null),
});

export type PerfilArchivo = z.infer<typeof perfilArchivoSchema>;

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
  bloques: BloquesArchivo;
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

      // Unidades del aula virtual: solo lectura (las regenera el sync). Las que
      // quedaron sin módulos no se muestran.
      const secciones: Seccion[] = (m.secciones ?? [])
        .map((s) => ({
          nombre: s.nombre ?? '',
          modulos: s.modulos.map(
            (mo): ModuloCurso => ({
              id: mo.id,
              nombre: mo.nombre,
              tipo: mo.tipo ?? '',
              url: mo.url,
              ...(mo.descripcion ? { descripcion: mo.descripcion } : {}),
            })
          ),
        }))
        .filter((s) => s.modulos.length > 0);

      return {
        id: m.id,
        nombre: m.nombre,
        profe: extra.profe ?? m.profe ?? '',
        aula: extra.aula ?? m.aula ?? '',
        color: esColor(colorCrudo) ? colorCrudo : colorDeId(m.id),
        source: m.source === 'manual' ? 'manual' : 'moodle',
        ...(m.asistenciaUrl ? { asistenciaUrl: m.asistenciaUrl } : {}),
        ...(m.claseUrl ? { claseUrl: m.claseUrl } : {}),
        ...(secciones.length > 0 ? { secciones } : {}),
        horarios: hs,
        // Bloques del snapshot + los que el usuario escribió en el editor
        // (datos/bloques.json), todos ordenados por `orden`.
        bloques: [
          ...(m.bloques ?? []).map((b, i): Bloque => ({
            id: b.id,
            materiaId: b.materiaId ?? m.id,
            tipo: (TIPOS_BLOQUE as readonly string[]).includes(b.tipo ?? '')
              ? (b.tipo as TipoBloque)
              : 'texto',
            texto: b.texto ?? '',
            url: b.url ?? '',
            estado: (ESTADOS_BLOQUE as readonly string[]).includes(b.estado ?? '')
              ? (b.estado as EstadoBloque)
              : 'pendiente',
            hecho: b.hecho ?? false,
            orden: b.orden ?? (i + 1) * 1000,
            createdAt: b.createdAt ?? snapshot.generado ?? new Date(0).toISOString(),
          })),
          ...(ov.bloques[m.id] ?? []).map(
            (b): Bloque => ({ ...b, materiaId: b.materiaId ?? m.id })
          ),
        ].sort((a, b) => a.orden - b.orden || a.createdAt.localeCompare(b.createdAt)),
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
    'bloques',
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

  const [crudoSnap, crudoHor, crudoEst, crudoExtra, crudoArch, crudoAvisos, crudoBloques] =
    await Promise.all([
      leerJson(rutaSnapshot),
      leerJson(rutaDatos('horarios')),
      leerJson(rutaDatos('avisosEstado')),
      leerJson(rutaDatos('materiasExtra')),
      leerJson(rutaDatos('archivosManuales')),
      leerJson(rutaDatos('avisosManuales')),
      leerJson(rutaDatos('bloques')),
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
  const blq = bloquesArchivoSchema.safeParse(crudoBloques ?? {});

  const datos = armar(snap.data, {
    horarios: hor.success ? hor.data : {},
    estados: est.success ? est.data : {},
    extra: extra.success ? extra.data : {},
    archivos: arch.success ? arch.data : {},
    avisos: avm.success ? avm.data : [],
    bloques: blq.success ? blq.data : {},
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

// --- Bloques (editor de notas) ---

/** Huecos de 1000 para poder reordenar sin reescribir todo. */
const PASO_ORDEN = 1000;

/**
 * Agrega un bloque al final de la materia en datos/bloques.json.
 * Devuelve el id generado ("manual:<uuid>").
 */
export async function crearBloqueLocal(
  materiaId: string,
  bloque: { tipo: TipoBloque; texto?: string; url?: string }
): Promise<string> {
  const mapa = { ...(await leerOverlay('bloques', bloquesArchivoSchema, {})) };
  const lista = mapa[materiaId] ?? [];
  const ultimo = lista.reduce((max, b) => Math.max(max, b.orden), 0);
  const id = nuevoId();
  mapa[materiaId] = [
    ...lista,
    {
      id,
      materiaId,
      tipo: bloque.tipo,
      texto: bloque.texto ?? '',
      url: bloque.url ?? '',
      estado: 'pendiente',
      hecho: false,
      orden: ultimo + PASO_ORDEN,
      createdAt: new Date().toISOString(),
    },
  ];
  await escribirJson(rutaDatos('bloques'), mapa);
  return id;
}

/** Aplica un patch a un bloque local. False si ese id no está en el overlay. */
export async function actualizarBloqueLocal(
  id: string,
  patch: { texto?: string; url?: string; estado?: EstadoBloque; hecho?: boolean }
): Promise<boolean> {
  const mapa = { ...(await leerOverlay('bloques', bloquesArchivoSchema, {})) };
  let encontrado = false;
  for (const [materiaId, lista] of Object.entries(mapa)) {
    if (!lista.some((b) => b.id === id)) continue;
    encontrado = true;
    mapa[materiaId] = lista.map((b) => (b.id === id ? { ...b, ...patch } : b));
  }
  if (!encontrado) return false;
  await escribirJson(rutaDatos('bloques'), mapa);
  return true;
}

/** Borra un bloque local. False si ese id no está en el overlay. */
export async function eliminarBloqueLocal(id: string): Promise<boolean> {
  const mapa = { ...(await leerOverlay('bloques', bloquesArchivoSchema, {})) };
  let encontrado = false;
  for (const [materiaId, lista] of Object.entries(mapa)) {
    const filtrada = lista.filter((b) => b.id !== id);
    if (filtrada.length === lista.length) continue;
    encontrado = true;
    if (filtrada.length === 0) delete mapa[materiaId];
    else mapa[materiaId] = filtrada;
  }
  if (!encontrado) return false;
  await escribirJson(rutaDatos('bloques'), mapa);
  return true;
}

/** Reasigna el `orden` de varios bloques de una. Ignora los ids que no existan. */
export async function reordenarBloquesLocales(
  items: { id: string; orden: number }[]
): Promise<void> {
  const ordenes = new Map(items.map((i) => [i.id, i.orden]));
  const mapa = { ...(await leerOverlay('bloques', bloquesArchivoSchema, {})) };
  for (const [materiaId, lista] of Object.entries(mapa)) {
    mapa[materiaId] = lista.map((b) =>
      ordenes.has(b.id) ? { ...b, orden: ordenes.get(b.id)! } : b
    );
  }
  await escribirJson(rutaDatos('bloques'), mapa);
}

// --- Perfil + foto ---

/** Perfil guardado en datos/perfil.json, o null si todavía no existe. */
export async function leerPerfilLocal(): Promise<Perfil | null> {
  const crudo = await leerJson(rutaDatos('perfil'));
  if (crudo === null) return null;
  const parsed = perfilArchivoSchema.safeParse(crudo);
  if (!parsed.success) return null;
  return {
    nombre: parsed.data.nombre,
    instituto: parsed.data.instituto,
    avatarUrl: parsed.data.avatarUrl,
  };
}

/**
 * Escribe datos/perfil.json. `avatarUrl: undefined` conserva la foto guardada
 * (mismo contrato que el upsert de Supabase).
 */
export async function escribirPerfilLocal(perfil: {
  nombre: string;
  instituto: string;
  avatarUrl?: string;
}): Promise<void> {
  const previo = await leerPerfilLocal();
  await escribirJson(rutaDatos('perfil'), {
    nombre: perfil.nombre,
    instituto: perfil.instituto || null,
    avatarUrl: perfil.avatarUrl ?? previo?.avatarUrl ?? null,
  });
}

/**
 * Deja en el perfil el nombre del instituto que devuelve el aula virtual
 * (`sitename` de core_webservice_get_site_info). El instituto no se escribe a
 * mano: es un dato del sitio, así que lo manda el que acaba de hablar con la
 * API. Escribe solo si cambió.
 */
export async function sincronizarInstitutoLocal(sitio: string): Promise<void> {
  const limpio = sitio.trim();
  if (!limpio) return;
  const previo = await leerPerfilLocal();
  if (previo?.instituto === limpio) return;
  await escribirPerfilLocal({ nombre: previo?.nombre ?? '', instituto: limpio });
}

/** Extensiones de imagen que aceptamos para el avatar (mime → extensión). */
const EXT_POR_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/heic': 'heic',
};

const MIME_POR_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  heic: 'image/heic',
};

export const extensionAvatar = (mime: string): string | null =>
  EXT_POR_MIME[mime.toLowerCase()] ?? null;

/**
 * Guarda la foto de perfil en datos/avatar.<ext> (borrando la anterior, que
 * puede tener otra extensión). Sin Supabase Storage, el disco es el bucket.
 */
export async function escribirAvatarLocal(datos: Uint8Array, ext: string): Promise<void> {
  const dir = dirDatos();
  await fs.mkdir(dir, { recursive: true });
  await borrarAvatarLocal();
  await fs.writeFile(path.join(dir, `avatar.${ext}`), datos);
}

/** Borra cualquier datos/avatar.<ext> que haya. */
export async function borrarAvatarLocal(): Promise<void> {
  const dir = dirDatos();
  for (const e of Object.keys(MIME_POR_EXT)) {
    await fs.rm(path.join(dir, `avatar.${e}`), { force: true });
  }
}

/** La foto de perfil guardada en disco, o null si no hay ninguna. */
export async function leerAvatarLocal(): Promise<{
  datos: Buffer;
  contentType: string;
} | null> {
  const dir = dirDatos();
  for (const [ext, contentType] of Object.entries(MIME_POR_EXT)) {
    try {
      return { datos: await fs.readFile(path.join(dir, `avatar.${ext}`)), contentType };
    } catch {
      // probamos la siguiente extensión
    }
  }
  return null;
}
