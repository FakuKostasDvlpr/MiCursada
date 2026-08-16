/**
 * Un schema Zod por función de la allowlist (portado de cursada-sync).
 *
 * Zod 4: usamos `z.looseObject(...)` (el reemplazo de `.passthrough()` de Zod 3)
 * para tolerar campos extra que agregan los plugins de la instancia
 * (Zoom, BigBlueButton, IntelliBoard, VideoTime, godeep), pero siendo
 * estrictos en los campos que efectivamente usamos: si un campo usado cambia
 * de forma, el parse falla con un error claro en vez de dejar un undefined
 * silencioso.
 *
 * Epochs: SIEMPRE en segundos (trampa #2). `duedate`/`enddate` en 0 significa
 * "sin fecha" (trampa #3) — eso se resuelve en la capa de uso, acá solo se tipa.
 *
 * SOLO SERVIDOR por convención (parte de lib/moodle/).
 */
import { z } from 'zod';
import type { FuncionMoodle } from './cliente';

const loose = z.looseObject;

/**
 * Archivo devuelto por los web services de módulos (`contentfiles`,
 * `introattachments`, `introfiles`).
 *
 * ⚠️ `fileurl` trae el `wstoken` embebido (trampa #5): no persistir jamás.
 * Se usa solo en memoria, y el índice server-only lo guarda SIN el token.
 */
export const archivoWsSchema = loose({
  filename: z.string(),
  filepath: z.string().nullable().optional(),
  filesize: z.number().optional(),
  fileurl: z.string().nullable().optional(),
  mimetype: z.string().nullable().optional(),
  isexternalfile: z.boolean().optional(),
});

// 1. core_webservice_get_site_info
export const siteInfoSchema = loose({
  sitename: z.string(),
  username: z.string(),
  fullname: z.string(),
  userid: z.number(),
  siteurl: z.string(),
  release: z.string().optional(),
  functions: z.array(loose({ name: z.string(), version: z.string() })),
});

// 2. core_enrol_get_users_courses — array plano de cursos
export const cursoSchema = loose({
  id: z.number(),
  shortname: z.string(),
  fullname: z.string(),
  visible: z.number().optional(),
  hidden: z.boolean().optional(),
  startdate: z.number().optional(),
  enddate: z.number().optional(),
  progress: z.number().nullable().optional(),
});
export const cursosSchema = z.array(cursoSchema);

// 3. core_course_get_contents — array de secciones
export const contenidoArchivoSchema = loose({
  type: z.string(),
  filename: z.string(),
  fileurl: z.string().nullable().optional(), // ⚠️ trae el token embebido: no persistir (y puede venir null)
  filesize: z.number().optional(),
  timemodified: z.number().optional(),
  mimetype: z.string().optional(),
});
export const moduloSchema = loose({
  id: z.number(), // cmid
  name: z.string(),
  modname: z.string(),
  instance: z.number().optional(),
  url: z.string().optional(),
  visible: z.number().optional(),
  uservisible: z.boolean().optional(),
  description: z.string().optional(), // HTML: sanitizar / pasar por aTextoPlano
  contents: z.array(contenidoArchivoSchema).optional(),
});
export const seccionSchema = loose({
  id: z.number(),
  name: z.string(),
  section: z.number().optional(),
  visible: z.number().optional(),
  uservisible: z.boolean().optional(),
  summary: z.string().optional(),
  modules: z.array(moduloSchema),
});
export const contenidosCursoSchema = z.array(seccionSchema);

// 4. core_calendar_get_action_events_by_timesort
export const eventoAccionSchema = loose({
  id: z.number(),
  name: z.string(),
  eventtype: z.string(),
  timesort: z.number(),
  timestart: z.number().optional(),
  modulename: z.string().nullable().optional(),
  instance: z.number().nullable().optional(),
  course: loose({ id: z.number(), fullname: z.string(), shortname: z.string() }).optional(),
  action: loose({ name: z.string(), url: z.string(), actionable: z.boolean() })
    .nullable()
    .optional(),
});
export const eventosCalendarioSchema = loose({
  events: z.array(eventoAccionSchema),
  firstid: z.number().optional(),
  lastid: z.number().optional(),
});

// 5. mod_assign_get_assignments
export const assignmentSchema = loose({
  id: z.number(),
  cmid: z.number(),
  course: z.number(),
  name: z.string(),
  duedate: z.number(), // 0 = sin fecha, NO 1970
  allowsubmissionsfromdate: z.number().optional(),
  cutoffdate: z.number().optional(),
  intro: z.string().optional(), // HTML: sanitizar antes de renderizar
  // Adjuntos de la consigna (ej. "2022C2-ORT-FPROG-TP1.pdf").
  introattachments: z.array(archivoWsSchema).optional(),
});
export const assignmentsSchema = loose({
  courses: z.array(
    loose({
      id: z.number(),
      fullname: z.string(),
      shortname: z.string(),
      assignments: z.array(assignmentSchema),
    })
  ),
  warnings: z.array(z.unknown()).optional(),
});

// 6. mod_assign_get_submission_status
export const submissionStatusSchema = loose({
  lastattempt: loose({
    submission: loose({
      id: z.number(),
      status: z.string(), // 'new' | 'draft' | 'submitted' | 'reopened'
      timemodified: z.number().optional(),
    }).optional(),
    submissionsenabled: z.boolean().optional(),
    cansubmit: z.boolean().optional(),
    graded: z.boolean().optional(),
  }).optional(),
  feedback: z.unknown().optional(),
  warnings: z.array(z.unknown()).optional(),
});

// 7. gradereport_user_get_grade_items
export const gradeItemSchema = loose({
  id: z.number().nullable().optional(),
  itemname: z.string().nullable(),
  itemtype: z.string(), // 'course' = fila del total, separarla
  itemmodule: z.string().nullable().optional(),
  cmid: z.number().nullable().optional(),
  graderaw: z.number().nullable().optional(), // null = sin corregir
  gradeformatted: z.string().optional(),
  grademin: z.number().optional(),
  grademax: z.number().optional(),
});
export const gradeItemsSchema = loose({
  usergrades: z.array(
    loose({
      courseid: z.number(),
      userid: z.number(),
      gradeitems: z.array(gradeItemSchema),
    })
  ),
  warnings: z.array(z.unknown()).optional(),
});

// 8a. mod_forum_get_forums_by_courses — array plano de foros
export const foroSchema = loose({
  id: z.number(),
  course: z.number(),
  type: z.string(), // 'news' = foro de Novedades
  name: z.string(),
  cmid: z.number(),
  numdiscussions: z.number().optional(),
});
export const forosSchema = z.array(foroSchema);

// 8b. mod_forum_get_forum_discussions
export const discusionSchema = loose({
  id: z.number(),
  name: z.string(),
  timemodified: z.number(),
  userfullname: z.string().nullable().optional(),
  message: z.string(), // HTML: sanitizar
  pinned: z.boolean().optional(),
});
export const discusionesSchema = loose({
  discussions: z.array(discusionSchema),
  warnings: z.array(z.unknown()).optional(),
});

// 9. core_calendar_get_calendar_export_token
export const exportTokenSchema = loose({
  token: z.string(), // ⚠️ credencial: no loguear su valor
  warnings: z.array(z.unknown()).optional(),
});

// 10. Contenido de los módulos para el lector embebido.
//     Todas comparten forma: `{ <plural>: [...], warnings: [] }`, y cada ítem
//     trae `coursemodule` (el cmid) que es la clave con la que se pegan a las
//     secciones de core_course_get_contents.

const moduloContenidoBase = {
  id: z.number(),
  coursemodule: z.number(), // cmid
  course: z.number(),
  name: z.string(),
  intro: z.string().optional(), // HTML: sanitizar
  introfiles: z.array(archivoWsSchema).optional(),
};

export const paginaSchema = loose({
  ...moduloContenidoBase,
  content: z.string().optional(), // HTML completo de la página
  contentfiles: z.array(archivoWsSchema).optional(),
});
export const paginasSchema = loose({
  pages: z.array(paginaSchema),
  warnings: z.array(z.unknown()).optional(),
});

export const urlModuloSchema = loose({
  ...moduloContenidoBase,
  externalurl: z.string().optional(),
});
export const urlsSchema = loose({
  urls: z.array(urlModuloSchema),
  warnings: z.array(z.unknown()).optional(),
});

export const recursoSchema = loose({
  ...moduloContenidoBase,
  contentfiles: z.array(archivoWsSchema).optional(),
});
export const recursosSchema = loose({
  resources: z.array(recursoSchema),
  warnings: z.array(z.unknown()).optional(),
});

export const leccionSchema = loose({
  id: z.number(),
  coursemodule: z.number().optional(),
  course: z.number(),
  name: z.string(),
  intro: z.string().optional(),
});
export const leccionesSchema = loose({
  lessons: z.array(leccionSchema),
  warnings: z.array(z.unknown()).optional(),
});

export const cuestionarioSchema = loose({
  id: z.number(),
  coursemodule: z.number().optional(),
  course: z.number(),
  name: z.string(),
  intro: z.string().optional(),
});
export const cuestionariosSchema = loose({
  quizzes: z.array(cuestionarioSchema),
  warnings: z.array(z.unknown()).optional(),
});

/** Mapa función → schema, para validar genéricamente. */
export const schemasPorFuncion: Record<FuncionMoodle, z.ZodType> = {
  core_webservice_get_site_info: siteInfoSchema,
  core_enrol_get_users_courses: cursosSchema,
  core_course_get_contents: contenidosCursoSchema,
  core_calendar_get_action_events_by_timesort: eventosCalendarioSchema,
  mod_assign_get_assignments: assignmentsSchema,
  mod_assign_get_submission_status: submissionStatusSchema,
  gradereport_user_get_grade_items: gradeItemsSchema,
  mod_forum_get_forums_by_courses: forosSchema,
  mod_forum_get_forum_discussions: discusionesSchema,
  core_calendar_get_calendar_export_token: exportTokenSchema,
  mod_page_get_pages_by_courses: paginasSchema,
  mod_url_get_urls_by_courses: urlsSchema,
  mod_resource_get_resources_by_courses: recursosSchema,
  mod_lesson_get_lessons_by_courses: leccionesSchema,
  mod_quiz_get_quizzes_by_courses: cuestionariosSchema,
};

export type SiteInfo = z.infer<typeof siteInfoSchema>;
export type Curso = z.infer<typeof cursosSchema>[number];
export type SeccionCurso = z.infer<typeof contenidosCursoSchema>[number];
export type EventoCalendario = z.infer<typeof eventosCalendarioSchema>['events'][number];
export type CursoConAssignments = z.infer<typeof assignmentsSchema>['courses'][number];
export type Assignment = CursoConAssignments['assignments'][number];
export type Foro = z.infer<typeof forosSchema>[number];
export type Discusion = z.infer<typeof discusionesSchema>['discussions'][number];
export type ArchivoWs = z.infer<typeof archivoWsSchema>;
export type Pagina = z.infer<typeof paginaSchema>;
export type UrlModulo = z.infer<typeof urlModuloSchema>;
export type Recurso = z.infer<typeof recursoSchema>;
export type Leccion = z.infer<typeof leccionSchema>;
export type Cuestionario = z.infer<typeof cuestionarioSchema>;
