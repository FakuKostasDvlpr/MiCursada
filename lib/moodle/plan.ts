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
import type { ModuloCurso, Requisito, Seccion } from '@/lib/types';
import { call, TokenInvalido } from './cliente';
import {
  RegistroRefs,
  sanitizar,
  tieneContenido,
  videoDesdeHtml,
  videoYoutube,
  type ArchivoModulo,
  type RefArchivo,
} from './contenido';
import { leerCredenciales, type Credencial } from './credenciales';
import {
  aTextoPlano,
  decodificarHtml,
  epochAIso,
  limpiarNombre,
  sinToken,
  urlModuloAbsoluta,
} from './normalizar';
import {
  assignmentsSchema,
  contenidosCursoSchema,
  cuestionariosSchema,
  cursosSchema,
  eventosCalendarioSchema,
  leccionesSchema,
  paginasSchema,
  recursosSchema,
  siteInfoSchema,
  urlsSchema,
  type ArchivoWs,
  type Assignment,
  type Cuestionario,
  type Curso,
  type CursoConAssignments,
  type EventoCalendario,
  type Leccion,
  type Pagina,
  type Recurso,
  type SeccionCurso,
  type SiteInfo,
  type UrlModulo,
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
  /** HTML de la descripción que el profe escribió debajo del ítem. */
  description?: string | undefined;
  /** ⚠️ `fileurl` trae el token: solo se usa en memoria (ver contenido.ts). */
  contents?: Array<ArchivoWs & { type: string }> | undefined;
  /** Seguimiento de finalización de ESTE usuario (ver moduloSchema). */
  completiondata?:
    | {
        state: number;
        hascompletion?: boolean | undefined;
        istrackeduser?: boolean | undefined;
        details?:
          | ReadonlyArray<{
              rulevalue?: { status?: number | undefined; description?: string | undefined };
            }>
          | undefined;
      }
    | undefined;
}

/**
 * ¿El módulo está marcado como hecho en el aula virtual?
 *
 * `undefined` cuando el módulo NO tiene seguimiento de finalización o el
 * usuario no es un alumno trackeado: ahí "pendiente" no significaría nada y la
 * app no debe mostrar ni un tilde ni un vacío. Es distinto de `false`, que sí
 * es "tenés esto pendiente".
 *
 * Estados de Moodle: 0 = pendiente, 1 = completo, 2 = completo y aprobado,
 * 3 = completo y desaprobado. Los tres últimos cuentan como hecho: la actividad
 * se hizo, la nota es otro tema.
 */
export function finalizacionDeModulo(mod: ModuloContenido): boolean | undefined {
  const c = mod.completiondata;
  if (!c) return undefined;
  if (c.hascompletion === false || c.istrackeduser === false) return undefined;
  return c.state !== 0;
}

/**
 * Las condiciones de finalización, con el texto que ya redactó Moodle en
 * castellano ("Ver", "Hacer un envío", "Completa la actividad hasta el final").
 *
 * NO se traduce ni se reescribe nada: es el mismo texto que ve en el aula
 * virtual, así que coincide con lo que el profe configuró.
 */
export function requisitosDeModulo(mod: ModuloContenido): Requisito[] {
  const detalles = mod.completiondata?.details ?? [];
  const salida: Requisito[] = [];
  for (const d of detalles) {
    const texto = decodificarHtml(d.rulevalue?.description ?? '').trim();
    if (texto === '') continue;
    salida.push({ texto, cumplido: d.rulevalue?.status === 1 });
  }
  return salida;
}

export interface SeccionContenido {
  /** "Unidad 1", "Evaluaciones Generales"… (los snapshots viejos de test no lo traen). */
  name?: string | undefined;
  uservisible?: boolean | undefined;
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

// ─── secciones (el curso como se ve en el aula virtual) ──────────────────────

/**
 * modnames que NO son contenido del curso y por lo tanto no se listan:
 * `label` es texto decorativo (no lleva a ningún lado) y attendance/zoom ya
 * tienen su propio botón en el detalle de la materia (asistenciaUrl/claseUrl).
 */
const MODNAMES_NO_CONTENIDO = new Set(['label', 'attendance', 'zoom']);

/** Tope de la descripción de un módulo: lo justo para 2 líneas y un poco más. */
const MAX_DESCRIPCION = 400;

/** Recorta en el último espacio antes del tope y agrega elipsis. */
function recortar(texto: string, max: number): string {
  if (texto.length <= max) return texto;
  const duro = texto.slice(0, max);
  const corte = duro.lastIndexOf(' ');
  return `${(corte > max * 0.6 ? duro.slice(0, corte) : duro).trimEnd()}…`;
}

// ─── contenido embebible de cada módulo ──────────────────────────────────────

/** Lo que la app puede mostrar de un módulo SIN salir al aula virtual. */
export type ContenidoModulo = {
  html?: string;
  enlace?: string;
  video?: string;
  archivos?: ArchivoModulo[];
};

/** Las respuestas `*_by_courses` (y los assignments) ya parseadas con Zod. */
export interface ContenidosCrudos {
  pages: Pagina[];
  urls: UrlModulo[];
  resources: Recurso[];
  lessons: Leccion[];
  quizzes: Cuestionario[];
  assignments: Assignment[];
}

/** Materia prima de un módulo antes de sanitizar. */
type Crudo = {
  html: string;
  enlace: string;
  archivos: ArchivoWs[];
};

function vacio(): Crudo {
  return { html: '', enlace: '', archivos: [] };
}

/**
 * Junta el contenido de UN módulo: sanitiza el HTML (registrando las imágenes
 * de Moodle en el índice de refs), arma `archivos[]` con refs opacas y detecta
 * el video de YouTube.
 *
 * Los `fileurl` NUNCA salen de acá: van al índice server-only `refs` y sin el
 * token. Lo que se devuelve (y termina en el snapshot) solo tiene la ref.
 */
export function contenidoDeModulo(
  cmid: number,
  crudo: Crudo,
  refs: Record<string, RefArchivo>
): ContenidoModulo | null {
  const registro = new RegistroRefs(cmid, refs);

  const archivos: ArchivoModulo[] = [];
  for (const f of crudo.archivos) {
    const ref = registro.registrar(f.fileurl, f.filename, f.mimetype ?? undefined);
    if (ref === null) continue;
    archivos.push({
      nombre: f.filename,
      mime: f.mimetype ?? 'application/octet-stream',
      tamano: f.filesize ?? 0,
      ref,
    });
  }

  const html = sanitizar(crudo.html, { registrarArchivo: (src) => registro.registrar(src) });
  const conHtml = tieneContenido(html) ? html : '';
  const enlace = /^https?:\/\//i.test(crudo.enlace.trim()) ? crudo.enlace.trim() : '';
  const video = videoDesdeHtml(conHtml) ?? videoYoutube(enlace);

  if (conHtml === '' && enlace === '' && video === null && archivos.length === 0) return null;
  return {
    ...(conHtml !== '' ? { html: conHtml } : {}),
    ...(enlace !== '' ? { enlace } : {}),
    ...(video !== null ? { video } : {}),
    ...(archivos.length > 0 ? { archivos } : {}),
  };
}

/**
 * Mapa cmid → contenido embebible, a partir de las cinco llamadas
 * `*_by_courses`, los assignments y las secciones crudas.
 *
 * Las secciones aportan los archivos de las CARPETAS (`mod_folder` no tiene
 * web service en la allowlist, pero `core_course_get_contents` ya devuelve sus
 * `contents[]`) y son el fallback de `description` cuando el módulo no tiene
 * ninguna de las funciones específicas.
 */
export function contenidosPorModulo(
  crudos: ContenidosCrudos,
  secciones: readonly SeccionContenido[],
  refs: Record<string, RefArchivo>
): Map<number, ContenidoModulo> {
  const materia = new Map<number, Crudo>();
  const tomar = (cmid: number | undefined): Crudo | null => {
    if (typeof cmid !== 'number' || !Number.isFinite(cmid)) return null;
    const previo = materia.get(cmid);
    if (previo) return previo;
    const nuevo = vacio();
    materia.set(cmid, nuevo);
    return nuevo;
  };

  // page: el HTML completo de la página (lo más rico que devuelve la API).
  for (const p of crudos.pages) {
    const c = tomar(p.coursemodule);
    if (c === null) continue;
    c.html = (p.content ?? '').trim() || (p.intro ?? '');
    // `index.html` es el archivo interno con el que Moodle guarda la página:
    // ya lo estamos mostrando como `html`, listarlo sería ruido.
    c.archivos.push(
      ...(p.contentfiles ?? []).filter((f) => f.filename !== '' && f.filename !== 'index.html')
    );
  }
  // url: la consigna corta + el link externo.
  for (const u of crudos.urls) {
    const c = tomar(u.coursemodule);
    if (c === null) continue;
    c.html = u.intro ?? '';
    c.enlace = u.externalurl ?? '';
  }
  // resource: los PDFs / ZIPs sueltos.
  for (const r of crudos.resources) {
    const c = tomar(r.coursemodule);
    if (c === null) continue;
    c.html = r.intro ?? '';
    c.archivos.push(...(r.contentfiles ?? []));
  }
  for (const l of crudos.lessons) {
    const c = tomar(l.coursemodule);
    if (c !== null) c.html = l.intro ?? '';
  }
  for (const q of crudos.quizzes) {
    const c = tomar(q.coursemodule);
    if (c !== null) c.html = q.intro ?? '';
  }
  // assign: la consigna + los adjuntos del enunciado.
  for (const a of crudos.assignments) {
    const c = tomar(a.cmid);
    if (c === null) continue;
    c.html = a.intro ?? '';
    c.archivos.push(...(a.introattachments ?? []));
  }
  // folder (y cualquier módulo con contents): los archivos de la carpeta.
  for (const s of secciones) {
    for (const mod of s.modules) {
      const files = (mod.contents ?? []).filter(
        (f) => f.type === 'file' && f.filename !== '' && f.filename !== 'index.html'
      );
      if (files.length === 0) continue;
      const c = tomar(mod.id);
      if (c === null || c.archivos.length > 0) continue;
      c.archivos.push(...files);
      if (c.html === '') c.html = mod.description ?? '';
    }
  }

  const salida = new Map<number, ContenidoModulo>();
  for (const [cmid, crudo] of materia) {
    const contenido = contenidoDeModulo(cmid, crudo, refs);
    if (contenido !== null) salida.set(cmid, contenido);
  }
  return salida;
}

/**
 * Traduce las secciones de `core_course_get_contents` al contenido del curso
 * que muestra la app: las unidades con sus materiales, igual que el aula virtual.
 *
 * - Se saltean las secciones y los módulos con `uservisible === false` (el
 *   alumno no los ve en el aula: mostrarlos sería mentirle).
 * - Se saltean label (texto decorativo) y attendance/zoom (ya tienen botón
 *   propio, listarlos de nuevo sería duplicar).
 * - Las secciones que quedan sin módulos no se incluyen.
 * - La URL es SIEMPRE la del módulo (`urlModuloAbsoluta`), nunca el `fileurl`
 *   (trampa #5: trae el token embebido).
 * - `description` pasa por `aTextoPlano` y se omite si queda vacía o si repite
 *   el nombre del módulo (Moodle a veces duplica los dos campos). Es el
 *   resumen que se ve con el módulo PLEGADO.
 * - `contenidos` (opcional) es lo que se despliega dentro de la app: html
 *   sanitizado, enlace externo, video de YouTube y archivos con ref opaca.
 */
export function seccionesDesdeContenidos(
  secciones: readonly SeccionContenido[],
  baseUrl: string,
  contenidos?: ReadonlyMap<number, ContenidoModulo>
): Seccion[] {
  const salida: Seccion[] = [];
  for (const seccion of secciones) {
    if (seccion.uservisible === false) continue;
    const modulos: ModuloCurso[] = [];
    for (const mod of seccion.modules) {
      if (mod.uservisible === false) continue;
      if (MODNAMES_NO_CONTENIDO.has(mod.modname)) continue;
      const nombre = decodificarHtml(mod.name).trim();
      const descripcion = recortar(aTextoPlano(mod.description ?? ''), MAX_DESCRIPCION);
      const hecho = finalizacionDeModulo(mod);
      const requisitos = requisitosDeModulo(mod);
      modulos.push({
        id: `mod:${mod.id}`,
        nombre,
        tipo: mod.modname,
        url: urlModuloAbsoluta(baseUrl, mod.modname, mod.id),
        ...(descripcion !== '' && descripcion !== nombre ? { descripcion } : {}),
        ...(hecho !== undefined ? { hecho } : {}),
        ...(requisitos.length > 0 ? { requisitos } : {}),
        ...(contenidos?.get(mod.id) ?? {}),
      });
    }
    if (modulos.length === 0) continue;
    salida.push({ nombre: decodificarHtml(seccion.name ?? '').trim(), modulos });
  }
  return salida;
}

// ─── asistencia ──────────────────────────────────────────────────────────────

/**
 * URL del módulo de asistencia del curso ("mod/attendance/view.php?id={cmid}"),
 * o null si el curso no tiene uno visible para el alumno.
 *
 * El web service de esta instancia NO expone ninguna función de attendance, así
 * que no se puede leer ni marcar nada por API: lo único que guardamos es el link
 * para abrir el módulo en el aula virtual. Como archivo se sigue salteando
 * (`archivosDesdeContenidos` no lo toca).
 */
export function urlAsistenciaDesdeContenidos(
  secciones: readonly SeccionContenido[],
  baseUrl: string
): string | null {
  for (const seccion of secciones) {
    for (const mod of seccion.modules) {
      if (mod.modname !== 'attendance') continue;
      if (mod.uservisible === false) continue;
      return urlModuloAbsoluta(baseUrl, mod.modname, mod.id);
    }
  }
  return null;
}

// ─── clase virtual (Zoom) ────────────────────────────────────────────────────

/**
 * Nombres que delatan una sala que NO es la de cursada semanal. Las salas de
 * recuperatorio/examen conviven en el mismo curso que la de la comisión, y
 * mandar al alumno a la equivocada es peor que no mostrar el botón.
 */
const RE_SALA_NO_CURSADA = /recuperatorio|examen|parcial|final/i;

/**
 * URL del módulo de Zoom de la cursada ("mod/zoom/view.php?id={cmid}"), o null
 * si el curso no tiene una sala de cursada visible para el alumno.
 *
 * Criterio: solo módulos `zoom` con `uservisible`, descartando los que en el
 * nombre digan recuperatorio/examen/parcial/final. Si quedan varios se toma el
 * primero (el orden de las secciones del curso). Si SOLO hay salas de
 * recuperatorio/examen devuelve null: mejor sin botón que mandarlo al examen.
 */
export function urlClaseDesdeContenidos(
  secciones: readonly SeccionContenido[],
  baseUrl: string
): string | null {
  for (const seccion of secciones) {
    for (const mod of seccion.modules) {
      if (mod.modname !== 'zoom') continue;
      if (mod.uservisible === false) continue;
      if (RE_SALA_NO_CURSADA.test(decodificarHtml(mod.name))) continue;
      return urlModuloAbsoluta(baseUrl, mod.modname, mod.id);
    }
  }
  return null;
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

/**
 * Contenido de los módulos de TODOS los cursos: cinco llamadas en total (una
 * por tipo de módulo), no una por módulo. Cada una recibe `courseids[]` entero.
 *
 * Ninguna de las cinco es indispensable: si una falla, el lector muestra lo que
 * haya y el resto cae al link del aula virtual. Por eso cada una degrada sola,
 * sin voltear el sync.
 */
export async function obtenerContenidoModulos(
  courseids: number[],
  cred: Credencial
): Promise<Omit<ContenidosCrudos, 'assignments'>> {
  const vacios = { pages: [], urls: [], resources: [], lessons: [], quizzes: [] };
  if (courseids.length === 0) return vacios;

  const porque = (e: unknown) => (e instanceof Error ? e.message : String(e));

  /**
   * Pide una función `*_by_courses` para todos los cursos de una.
   *
   * Si el LOTE falla, reintenta curso por curso antes de rendirse: en esta
   * instancia `mod_quiz_get_quizzes_by_courses` revienta con
   * `noconfigfilefound` por UN cuestionario con Safe Exam Browser, y Moodle
   * devuelve el error del lote entero — sin este fallback los 7 cursos se
   * quedaban sin descripción de sus cuestionarios por culpa de uno solo.
   *
   * El reintento cuesta N llamadas extra, pero solo se paga cuando el lote ya
   * falló (nunca en el camino feliz).
   */
  async function pedirLista<T>(
    fn: Parameters<typeof call>[0],
    extraer: (crudo: unknown) => T[]
  ): Promise<T[]> {
    try {
      return extraer(await call(fn, { courseids }, cred));
    } catch (e) {
      console.warn(`[moodle] ${fn} falló para el lote: ${porque(e)}`);
      if (courseids.length < 2) return [];

      const partes: T[] = [];
      let rotos = 0;
      for (const id of courseids) {
        try {
          partes.push(...extraer(await call(fn, { courseids: [id] }, cred)));
        } catch (e2) {
          rotos += 1;
          console.warn(`[moodle] ${fn} sin datos del curso ${id}: ${porque(e2)}`);
        }
      }
      console.warn(
        `[moodle] ${fn} recuperada curso por curso: ${courseids.length - rotos}/${courseids.length}`
      );
      return partes;
    }
  }

  const [pages, urls, resources, lessons, quizzes] = await Promise.all([
    pedirLista<Pagina>('mod_page_get_pages_by_courses', (c) => paginasSchema.parse(c).pages),
    pedirLista<UrlModulo>('mod_url_get_urls_by_courses', (c) => urlsSchema.parse(c).urls),
    pedirLista<Recurso>(
      'mod_resource_get_resources_by_courses',
      (c) => recursosSchema.parse(c).resources
    ),
    pedirLista<Leccion>(
      'mod_lesson_get_lessons_by_courses',
      (c) => leccionesSchema.parse(c).lessons
    ),
    pedirLista<Cuestionario>(
      'mod_quiz_get_quizzes_by_courses',
      (c) => cuestionariosSchema.parse(c).quizzes
    ),
  ]);
  return { pages, urls, resources, lessons, quizzes };
}

// ─── plan ────────────────────────────────────────────────────────────────────

const DIAS_CALENDARIO = 60;

export interface MateriaPlaneada {
  externalId: string; // "curso:{id}"
  nombre: string;
  cursoId: number;
  /** URL del módulo de asistencia del curso, si tiene uno visible. */
  asistenciaUrl?: string;
  /** URL de la sala de Zoom de la cursada, si el curso tiene una visible. */
  claseUrl?: string;
  /** Las unidades del curso con sus materiales, como se ven en el aula virtual. */
  secciones?: Seccion[];
}

export interface PlanMoodle {
  site: SiteInfo;
  cursos: Curso[];
  materias: MateriaPlaneada[];
  archivos: ArchivoPlaneado[];
  modulosSalteados: ModuloSalteado[];
  avisos: AvisoPlaneado[];
  avisosDescartados: AvisoDescartado[];
  /**
   * Índice SERVER-ONLY ref → URL de Moodle (sin token) de cada archivo del
   * curso. NO va al snapshot: se escribe aparte y solo lo lee el proxy
   * /api/archivo.
   */
  refsArchivos: Record<string, RefArchivo>;
  /**
   * Cursos cuyo contenido no se pudo bajar, y por qué. El sync sigue igual con
   * el resto: que una materia falle no puede dejarte sin las otras seis.
   */
  cursosFallados: CursoFallado[];
  /** Partes opcionales del plan que se cayeron (avisos), para reportarlo. */
  degradado: string[];
}

/** Un curso que quedó sin contenido en esta corrida. */
export interface CursoFallado {
  cursoId: number;
  nombre: string;
  motivo: string;
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
  const asistenciaPorCurso = new Map<number, string>();
  const clasePorCurso = new Map<number, string>();
  const contenidosPorCurso = new Map<number, SeccionCurso[]>();
  const cursosFallados: CursoFallado[] = [];
  const degradado: string[] = [];
  for (const curso of cursos) {
    // Un curso que falla (permisos, un módulo raro, el servidor tosiendo) NO
    // puede voltear el sync entero: se anota y se sigue con los demás.
    let secciones: SeccionCurso[];
    try {
      secciones = await obtenerContenidos(curso.id, cred);
    } catch (e) {
      // El token inválido no es "un curso que falló": van a fallar todos y hay
      // que volver a loguearse, así que se propaga tal cual.
      if (e instanceof TokenInvalido) throw e;
      const motivo = e instanceof Error ? e.message : String(e);
      console.warn(`[moodle] sin contenido del curso ${curso.id}: ${motivo}`);
      cursosFallados.push({ cursoId: curso.id, nombre: limpiarNombre(curso.fullname), motivo });
      continue;
    }
    contenidosPorCurso.set(curso.id, secciones);
    const r = archivosDesdeContenidos(curso.id, secciones, cred.url);
    archivos.push(...r.archivos);
    modulosSalteados.push(...r.salteados);
    // El módulo de attendance se saltea como archivo, pero su link se guarda
    // para el recordatorio de "Dar el presente".
    const asistencia = urlAsistenciaDesdeContenidos(secciones, cred.url);
    if (asistencia !== null) asistenciaPorCurso.set(curso.id, asistencia);
    // Ídem el zoom de la comisión, para "Entrar a la clase".
    const clase = urlClaseDesdeContenidos(secciones, cred.url);
    if (clase !== null) clasePorCurso.set(curso.id, clase);
  }

  // Si NINGÚN curso trajo contenido, no es "una materia que falló": está roto
  // el servidor, la red o los permisos. Seguir escribiría un snapshot vacío
  // ENCIMA del bueno y te dejaría la app en blanco — mejor cortar acá y
  // conservar el snapshot anterior.
  if (cursos.length > 0 && contenidosPorCurso.size === 0) {
    throw new Error(
      `No se pudo bajar el contenido de ninguno de los ${cursos.length} cursos. ` +
        `Se conserva el snapshot anterior. Último motivo: ${cursosFallados.at(-1)?.motivo ?? 'desconocido'}`
    );
  }

  // assignments (una sola llamada) + calendario (+60 días) → avisos.
  // Los avisos son un extra: si el aula no los da, preferimos una app con las
  // materias y sin avisos antes que un sync que no termina nunca.
  const idsCursos = cursos.map((c) => c.id);
  let assignments: Assignment[] = [];
  try {
    const cursosConTps = await obtenerAssignments(idsCursos, cred);
    assignments = cursosConTps.flatMap((c) => c.assignments);
  } catch (e) {
    if (e instanceof TokenInvalido) throw e;
    const motivo = e instanceof Error ? e.message : String(e);
    console.warn(`[moodle] sin entregas (mod_assign_get_assignments): ${motivo}`);
    degradado.push('entregas');
  }
  const deAssigns = avisosDesdeAssignments(assignments, nombresCortos);

  // Contenido embebible de los módulos: 5 llamadas más para TODOS los cursos.
  const modulos = await obtenerContenidoModulos(idsCursos, cred);
  const refsArchivos: Record<string, RefArchivo> = {};
  const todasLasSecciones = [...contenidosPorCurso.values()].flat();
  const contenidos = contenidosPorModulo(
    { ...modulos, assignments },
    todasLasSecciones,
    refsArchivos
  );

  for (const m of materias) {
    const url = asistenciaPorCurso.get(m.cursoId);
    if (url !== undefined) m.asistenciaUrl = url;
    const clase = clasePorCurso.get(m.cursoId);
    if (clase !== undefined) m.claseUrl = clase;
    // Y el curso entero por unidades, para la tab "Curso".
    const secs = seccionesDesdeContenidos(
      contenidosPorCurso.get(m.cursoId) ?? [],
      cred.url,
      contenidos
    );
    if (secs.length > 0) m.secciones = secs;
  }

  const ahora = Math.floor(Date.now() / 1000);
  let eventos: EventoCalendario[] = [];
  try {
    eventos = await obtenerEventos(ahora, ahora + DIAS_CALENDARIO * 24 * 60 * 60, cred);
  } catch (e) {
    if (e instanceof TokenInvalido) throw e;
    const motivo = e instanceof Error ? e.message : String(e);
    console.warn(`[moodle] sin calendario: ${motivo}`);
    degradado.push('calendario');
  }
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
    refsArchivos,
    cursosFallados,
    degradado,
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
  /** Solo si el curso tiene módulo de asistencia visible. */
  asistenciaUrl?: string;
  /** Solo si el curso tiene sala de Zoom de cursada visible. */
  claseUrl?: string;
  /** Solo si el curso tiene al menos una unidad con contenido visible. */
  secciones?: Seccion[];
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
    ...(m.asistenciaUrl ? { asistenciaUrl: m.asistenciaUrl } : {}),
    ...(m.claseUrl ? { claseUrl: m.claseUrl } : {}),
    ...(m.secciones && m.secciones.length > 0 ? { secciones: m.secciones } : {}),
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

/**
 * Escribe datos/aula-virtual-archivos.json: el índice ref → URL de Moodle que
 * usa el proxy /api/archivo. Es SERVER-ONLY y NO se manda nunca al cliente.
 * Las URLs ya vienen sin token, y `sinToken` es la última red de seguridad.
 */
export async function escribirRefsArchivos(refs: Record<string, RefArchivo>): Promise<void> {
  const salida = rutaDatos('archivosCurso');
  const json = sinToken(JSON.stringify(refs, null, 2));
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
  /** Módulos del curso con contenido embebible (para el reporte del sync). */
  modulos: number;
  conHtml: number;
  conVideo: number;
  conArchivos: number;
  /**
   * Materias que quedaron sin contenido en esta corrida, y partes que se
   * cayeron ("entregas", "calendario"). Vacíos = sync completo. Se reportan
   * para que un sync a medias NO se vea igual que uno entero.
   */
  cursosFallados: CursoFallado[];
  degradado: string[];
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
  await escribirRefsArchivos(plan.refsArchivos);

  const todos = snapshot.materias.flatMap((m) => (m.secciones ?? []).flatMap((s) => s.modulos));

  return {
    materias: snapshot.materias.length,
    archivos: snapshot.materias.reduce((n, m) => n + m.archivos.length, 0),
    avisos: snapshot.avisos.length,
    generado: snapshot.generado,
    nombre: plan.site.fullname,
    modulos: todos.length,
    conHtml: todos.filter((m) => m.html).length,
    conVideo: todos.filter((m) => m.video).length,
    conArchivos: todos.filter((m) => m.archivos && m.archivos.length > 0).length,
    cursosFallados: plan.cursosFallados,
    degradado: plan.degradado,
  };
}
