/**
 * Construcción del snapshot del aula virtual (portado de cursada-sync:
 * src/logica.ts + src/datos.ts + el comando `exportar` de src/cli.ts).
 *
 * Dos capas en un solo archivo:
 *   1. Lógica PURA (filtro de cursos vigentes, colores, archivos desde
 *      contenidos, avisos desde assignments/eventos con dedupe) — testeable
 *      con fixtures, sin red (ver plan.test.ts).
 *   2. Fetchers tipados + `construirPlan` / `sincronizarSnapshot`, que sí
 *      hablan con Moodle vía la allowlist de cliente.ts.
 *
 * SOLO SERVIDOR: usa el cliente de Moodle y node:fs. No importar desde un
 * client component.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { rutaDatos } from '@/lib/datos-locales';
import { call } from './cliente';
import { leerCredenciales, type Credencial } from './credenciales';
import {
  decodificarHtml,
  epochAIso,
  limpiarNombre,
  sinToken,
  urlModuloAbsoluta,
} from './normalizar';
import {
  assignmentsSchema,
  contenidosCursoSchema,
  cursosSchema,
  eventosCalendarioSchema,
  siteInfoSchema,
  type Curso,
  type CursoConAssignments,
  type EventoCalendario,
  type SeccionCurso,
  type SiteInfo,
} from './schemas';

// ─── cursos ──────────────────────────────────────────────────────────────────

export interface CursoBasico {
  id: number;
  visible?: number | undefined;
  hidden?: boolean | undefined;
  enddate?: number | undefined;
}

/**
 * Cursos VIGENTES: visibles y con `enddate` en el futuro.
 *
 * El filtro por `enddate > ahora` es también el que deja afuera los cursos
 * administrativos de la instancia ("Eventos", "INFGRL", "Soporte Zoom"...):
 * todos tienen `enddate = 0`, que acá cuenta como "no vigente".
 */
export function filtrarCursosVigentes<T extends CursoBasico>(
  cursos: readonly T[],
  ahoraSeg: number
): T[] {
  return cursos.filter(
    (c) => !c.hidden && c.visible !== 0 && typeof c.enddate === 'number' && c.enddate > ahoraSeg
  );
}

// ─── colores ─────────────────────────────────────────────────────────────────

/** Los 6 colores de materia del handoff (lib/types.ts COLORES_MATERIA). */
export const COLORES = ['#38bdf8', '#a78bfa', '#34d399', '#fb7185', '#f97316', '#e2e8f0'] as const;

/**
 * Round-robin sobre los 6 colores. `indice` es la posición de la materia en el
 * snapshot: rota desde 0 y queda estable entre corridas. El color editado a
 * mano por el usuario vive en datos/materias-extra.json y pisa a este.
 */
export function colorRoundRobin(indice: number): string {
  const i = ((indice % COLORES.length) + COLORES.length) % COLORES.length;
  return COLORES[i] as string;
}

// ─── nombres ─────────────────────────────────────────────────────────────────

/**
 * Nombre corto del curso para sufijos de avisos: lo que queda antes del
 * primer " - " del nombre limpio. "'Matemáticas - Plan 2 años 2°Semestre
 * 2026'" → "Matemáticas". Si no hay " - ", queda el nombre limpio entero.
 */
export function nombreCortoCurso(fullname: string): string {
  const limpio = limpiarNombre(fullname);
  const corte = limpio.split(' - ')[0]?.trim() ?? '';
  return corte === '' ? limpio : corte;
}

// ─── archivos ────────────────────────────────────────────────────────────────

/** modnames que se sincronizan como archivos de la materia. */
const MODNAMES_ARCHIVO = new Set(['resource', 'url', 'page', 'folder']);

export interface ModuloContenido {
  id: number; // cmid
  name: string;
  modname: string;
  uservisible?: boolean | undefined;
  contents?: Array<{ type: string; filename: string }> | undefined;
}

export interface SeccionContenido {
  modules: ModuloContenido[];
}

export interface ArchivoPlaneado {
  externalId: string;
  nombre: string;
  url: string;
  cursoId: number;
}

export interface ModuloSalteado {
  nombre: string;
  modname: string;
  motivo: string;
}

/**
 * Traduce las secciones de `core_course_get_contents` a archivos del snapshot.
 *
 * - Solo resource/url/page/folder; el resto (label, forum, assign, quiz,
 *   zoom, videotime, bigbluebuttonbn, attendance...) se saltea con motivo.
 * - `uservisible: false` se saltea (el alumno no lo ve en el aula).
 * - folder: UNA fila por archivo de `contents`, nombre "{carpeta} · {archivo}",
 *   pero la URL apunta al MÓDULO (urlModuloAbsoluta), nunca al `fileurl`
 *   (trampa #5: trae el token embebido).
 */
export function archivosDesdeContenidos(
  cursoId: number,
  secciones: readonly SeccionContenido[],
  baseUrl: string
): { archivos: ArchivoPlaneado[]; salteados: ModuloSalteado[] } {
  const archivos: ArchivoPlaneado[] = [];
  const salteados: ModuloSalteado[] = [];
  for (const seccion of secciones) {
    for (const mod of seccion.modules) {
      const nombre = decodificarHtml(mod.name).trim();
      if (mod.uservisible === false) {
        salteados.push({ nombre, modname: mod.modname, motivo: 'no visible para el alumno' });
        continue;
      }
      if (!MODNAMES_ARCHIVO.has(mod.modname)) {
        salteados.push({
          nombre,
          modname: mod.modname,
          motivo: `modname "${mod.modname}" no se sincroniza`,
        });
        continue;
      }
      const url = urlModuloAbsoluta(baseUrl, mod.modname, mod.id);
      if (mod.modname === 'folder') {
        const files = (mod.contents ?? []).filter((c) => c.type === 'file');
        if (files.length === 0) {
          salteados.push({ nombre, modname: mod.modname, motivo: 'carpeta vacía' });
          continue;
        }
        for (const f of files) {
          archivos.push({
            externalId: `mod:${mod.id}:${f.filename}`,
            nombre: `${nombre} · ${f.filename}`,
            url, // al módulo carpeta, no al fileurl
            cursoId,
          });
        }
      } else {
        archivos.push({ externalId: `mod:${mod.id}`, nombre, url, cursoId });
      }
    }
  }
  return { archivos, salteados };
}

// ─── avisos ──────────────────────────────────────────────────────────────────

export interface AssignmentBasico {
  id: number;
  cmid?: number;
  course: number;
  name: string;
  duedate: number; // 0 = sin fecha
}

export interface EventoBasico {
  id: number;
  name: string;
  timesort: number;
  modulename?: string | null | undefined;
  instance?: number | null | undefined;
  course?: { id: number } | undefined;
}

export interface AvisoPlaneado {
  externalId: string;
  /** título pelado, SIN el nombre de la materia (la app la muestra aparte) */
  titulo: string;
  /** título con " — {curso corto}" (para consumidores sin materiaId) */
  tituloConCurso: string;
  fecha: string; // YYYY-MM-DD (Buenos Aires)
  cursoId: number;
}

export interface AvisoDescartado {
  externalId: string;
  titulo: string;
  motivo: string;
}

/**
 * Assignments → avisos. `duedate = 0/null` NO genera aviso (trampa #3):
 * queda reportado como descartado con motivo.
 */
export function avisosDesdeAssignments(
  assignments: readonly AssignmentBasico[],
  nombresCortos: ReadonlyMap<number, string>
): { avisos: AvisoPlaneado[]; descartados: AvisoDescartado[] } {
  const avisos: AvisoPlaneado[] = [];
  const descartados: AvisoDescartado[] = [];
  for (const a of assignments) {
    const titulo = decodificarHtml(a.name).trim();
    const tituloConCurso = `${titulo} — ${nombresCortos.get(a.course) ?? `curso ${a.course}`}`;
    const fecha = epochAIso(a.duedate);
    if (fecha === null) {
      descartados.push({
        externalId: `assign:${a.id}`,
        titulo: tituloConCurso,
        motivo: 'sin fecha de entrega (duedate 0)',
      });
      continue;
    }
    avisos.push({ externalId: `assign:${a.id}`, titulo, tituloConCurso, fecha, cursoId: a.course });
  }
  return { avisos, descartados };
}

/**
 * Eventos del calendario → avisos, deduplicando contra los assignments ya
 * planificados: si el evento es de un `assign` cuyo `instance` ya generó un
 * aviso "assign:{id}", se descarta el evento (se prefiere el assign, que
 * tiene el duedate canónico). Eventos de cursos no vigentes o sin curso
 * también se descartan con motivo.
 */
export function avisosDesdeEventos(
  eventos: readonly EventoBasico[],
  assignsConAviso: ReadonlySet<number>,
  cursosVigentes: ReadonlySet<number>,
  nombresCortos: ReadonlyMap<number, string>
): { avisos: AvisoPlaneado[]; descartados: AvisoDescartado[] } {
  const avisos: AvisoPlaneado[] = [];
  const descartados: AvisoDescartado[] = [];
  for (const e of eventos) {
    const externalId = `evento:${e.id}`;
    const nombre = decodificarHtml(e.name).trim();
    const cursoId = e.course?.id;
    if (cursoId === undefined || !cursosVigentes.has(cursoId)) {
      descartados.push({ externalId, titulo: nombre, motivo: 'sin curso vigente asociado' });
      continue;
    }
    if (
      e.modulename === 'assign' &&
      typeof e.instance === 'number' &&
      assignsConAviso.has(e.instance)
    ) {
      descartados.push({
        externalId,
        titulo: nombre,
        motivo: `duplicado del aviso assign:${e.instance}`,
      });
      continue;
    }
    const fecha = epochAIso(e.timesort);
    if (fecha === null) {
      descartados.push({ externalId, titulo: nombre, motivo: 'sin fecha (timesort 0)' });
      continue;
    }
    avisos.push({
      externalId,
      titulo: nombre,
      tituloConCurso: `${nombre} — ${nombresCortos.get(cursoId) ?? `curso ${cursoId}`}`,
      fecha,
      cursoId,
    });
  }
  return { avisos, descartados };
}

// ─── fetchers (una llamada a Moodle cada uno, validada con Zod) ──────────────

export async function obtenerSiteInfo(cred?: Credencial): Promise<SiteInfo> {
  return siteInfoSchema.parse(await call('core_webservice_get_site_info', {}, cred));
}

export async function obtenerCursos(cred: Credencial): Promise<Curso[]> {
  return cursosSchema.parse(
    await call('core_enrol_get_users_courses', { userid: cred.userid }, cred)
  );
}

/** Cursos vigentes (visibles + enddate futuro), ordenados por shortname. */
export async function obtenerCursosVigentes(cred: Credencial): Promise<Curso[]> {
  const ahora = Math.floor(Date.now() / 1000);
  return filtrarCursosVigentes(await obtenerCursos(cred), ahora).sort((a, b) =>
    a.shortname.localeCompare(b.shortname, 'es')
  );
}

export async function obtenerContenidos(courseid: number, cred: Credencial): Promise<SeccionCurso[]> {
  return contenidosCursoSchema.parse(await call('core_course_get_contents', { courseid }, cred));
}

/** Eventos con fecha entre `desde` y `hasta` (epoch en segundos). */
export async function obtenerEventos(
  desdeSeg: number,
  hastaSeg: number,
  cred: Credencial
): Promise<EventoCalendario[]> {
  const data = eventosCalendarioSchema.parse(
    await call(
      'core_calendar_get_action_events_by_timesort',
      { timesortfrom: desdeSeg, timesortto: hastaSeg },
      cred
    )
  );
  return data.events;
}

/** TPs de todos los cursos pedidos, en UNA sola llamada. */
export async function obtenerAssignments(
  courseids: number[],
  cred: Credencial
): Promise<CursoConAssignments[]> {
  if (courseids.length === 0) return [];
  const data = assignmentsSchema.parse(
    await call('mod_assign_get_assignments', { courseids }, cred)
  );
  return data.courses;
}

// ─── plan ────────────────────────────────────────────────────────────────────

const DIAS_CALENDARIO = 60;

export interface MateriaPlaneada {
  externalId: string; // "curso:{id}"
  nombre: string;
  cursoId: number;
}

export interface PlanMoodle {
  site: SiteInfo;
  cursos: Curso[];
  materias: MateriaPlaneada[];
  archivos: ArchivoPlaneado[];
  modulosSalteados: ModuloSalteado[];
  avisos: AvisoPlaneado[];
  avisosDescartados: AvisoDescartado[];
}

/**
 * Baja todo lo necesario de Moodle y arma el estado deseado.
 * Orden: site_info (handshake que valida el token) → cursos vigentes →
 * contenidos de cada curso → assignments + calendario (+60 días).
 * Los foros no hacen falta para el snapshot (los avisos salen de
 * assignments/eventos), así que no se piden: una llamada menos al servidor.
 */
export async function construirPlan(cred: Credencial): Promise<PlanMoodle> {
  const site = await obtenerSiteInfo(cred);

  const cursos = await obtenerCursosVigentes(cred);

  const materias: MateriaPlaneada[] = cursos.map((c) => ({
    externalId: `curso:${c.id}`,
    nombre: limpiarNombre(c.fullname),
    cursoId: c.id,
  }));
  const nombresCortos = new Map(cursos.map((c) => [c.id, nombreCortoCurso(c.fullname)]));
  const idsVigentes = new Set(cursos.map((c) => c.id));

  // contenidos → archivos (una llamada por curso; la cola del cliente las
  // espacia 500 ms entre sí)
  const archivos: ArchivoPlaneado[] = [];
  const modulosSalteados: ModuloSalteado[] = [];
  for (const curso of cursos) {
    const secciones = await obtenerContenidos(curso.id, cred);
    const r = archivosDesdeContenidos(curso.id, secciones, cred.url);
    archivos.push(...r.archivos);
    modulosSalteados.push(...r.salteados);
  }

  // assignments (una sola llamada) + calendario (+60 días) → avisos
  const cursosConTps = await obtenerAssignments(
    cursos.map((c) => c.id),
    cred
  );
  const assignments = cursosConTps.flatMap((c) => c.assignments);
  const deAssigns = avisosDesdeAssignments(assignments, nombresCortos);

  const ahora = Math.floor(Date.now() / 1000);
  const eventos = await obtenerEventos(ahora, ahora + DIAS_CALENDARIO * 24 * 60 * 60, cred);
  const eventosNormalizados: EventoBasico[] = eventos.map((e) => ({
    id: e.id,
    name: e.name,
    timesort: e.timesort,
    modulename: e.modulename ?? null,
    instance: e.instance ?? null,
    ...(e.course ? { course: { id: e.course.id } } : {}),
  }));
  const conAviso = new Set(deAssigns.avisos.map((a) => Number(a.externalId.split(':')[1])));
  const deEventos = avisosDesdeEventos(eventosNormalizados, conAviso, idsVigentes, nombresCortos);

  return {
    site,
    cursos,
    materias,
    archivos,
    modulosSalteados,
    avisos: [...deAssigns.avisos, ...deEventos.avisos],
    avisosDescartados: [...deAssigns.descartados, ...deEventos.descartados],
  };
}

// ─── snapshot ────────────────────────────────────────────────────────────────

export type SnapshotArchivo = { id: string; materiaId: string; nombre: string; url: string };
export type SnapshotMateria = {
  id: string;
  nombre: string;
  profe: string;
  aula: string;
  color: string;
  source: 'moodle';
  horarios: [];
  archivos: SnapshotArchivo[];
  bloques: [];
};
export type SnapshotAviso = {
  id: string;
  materiaId: string | null;
  titulo: string;
  fecha: string;
  hecho: false;
};
export type Snapshot = {
  generado: string;
  materias: SnapshotMateria[];
  avisos: SnapshotAviso[];
};

/**
 * Plan → snapshot con el MISMO formato que produce `npm run exportar` de
 * cursada-sync (camelCase, ids = external_id estables). Los overlays del
 * usuario (horarios, profe/aula/color, avisos hechos, bloques, manuales) viven
 * en otros archivos y se aplican encima al leer: acá van vacíos a propósito.
 */
export function armarSnapshot(plan: PlanMoodle, generado = new Date().toISOString()): Snapshot {
  const materiaPorCurso = new Map(plan.materias.map((m) => [m.cursoId, m.externalId]));

  const materias: SnapshotMateria[] = plan.materias.map((m, i) => ({
    id: m.externalId,
    nombre: m.nombre,
    profe: '',
    aula: '',
    color: colorRoundRobin(i),
    source: 'moodle',
    horarios: [],
    archivos: plan.archivos
      .filter((a) => a.cursoId === m.cursoId)
      .map((a) => ({ id: a.externalId, materiaId: m.externalId, nombre: a.nombre, url: a.url })),
    bloques: [],
  }));

  const avisos: SnapshotAviso[] = plan.avisos.map((a) => ({
    id: a.externalId,
    // titulo SIN la materia: la app la muestra por materiaId
    materiaId: materiaPorCurso.get(a.cursoId) ?? null,
    titulo: a.titulo,
    fecha: a.fecha,
    hecho: false,
  }));

  return { generado, materias, avisos };
}

/** Escribe datos/aula-virtual.json. NO toca ningún otro archivo de datos/. */
export async function escribirSnapshot(snapshot: Snapshot): Promise<void> {
  const salida = rutaDatos('snapshot');
  // defensa en profundidad: nada con pinta de token llega al disco
  const json = sinToken(JSON.stringify(snapshot, null, 2));
  await fs.mkdir(path.dirname(salida), { recursive: true });
  await fs.writeFile(salida, `${json}\n`, 'utf8');
}

export type ResumenSync = {
  materias: number;
  archivos: number;
  avisos: number;
  generado: string;
  /** fullname del usuario según site_info (para mostrar "conectado como…"). */
  nombre: string;
};

/**
 * Flujo completo: baja el plan de Moodle, arma el snapshot y reescribe
 * datos/aula-virtual.json (y solo ese archivo). Devuelve contadores.
 */
export async function sincronizarSnapshot(cred?: Credencial): Promise<ResumenSync> {
  const credencial = cred ?? (await leerCredenciales());
  if (credencial === null) throw new Error('No hay token del aula virtual configurado.');

  const plan = await construirPlan(credencial);
  const snapshot = armarSnapshot(plan);
  await escribirSnapshot(snapshot);

  return {
    materias: snapshot.materias.length,
    archivos: snapshot.materias.reduce((n, m) => n + m.archivos.length, 0),
    avisos: snapshot.avisos.length,
    generado: snapshot.generado,
    nombre: plan.site.fullname,
  };
}
