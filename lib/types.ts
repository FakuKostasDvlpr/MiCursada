// Tipos de dominio de Mi Cursada.

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

/**
 * Tipos de bloque del editor estilo Notion. `ref` es una cita a algo del curso
 * (un TP, un cuestionario, una unidad): su `texto` es un único marcador
 * `[[mod:…|nombre]]`, ver lib/referencias.ts.
 */
export const TIPOS_BLOQUE = ['texto', 'titulo', 'tarea', 'link', 'ref', 'divisor'] as const;
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

/**
 * Qué se puede citar desde una nota.
 *
 * - `archivo`: un adjunto concreto del aula virtual ("TP2.pdf"). Es el
 *   "archivos de la materia" del handoff. El id es la `ref` OPACA del proxy.
 * - `modulo`: el ítem que lo contiene ("Guía de ejercicios") o una unidad.
 * - `materia` y `aviso`: cosas de la propia app.
 *
 * `materia` sigue acá aunque el menú ya no lo ofrezca (ver `catalogoRefs`): las
 * notas viejas que citan otra materia tienen que seguir resolviéndose.
 */
export const TIPOS_REF = ['archivo', 'modulo', 'materia', 'aviso'] as const;
export type TipoRef = (typeof TIPOS_REF)[number];

/** Color del chip de cada tipo de referencia (`REFCOL` del prototipo). */
export const COLOR_REF: Record<TipoRef, string> = {
  // Un archivo es contenido del aula igual que su módulo: mismo ámbar. Lo que
  // los distingue es el `kind` ("PDF" vs "Tarea") y el contexto.
  archivo: '#fbbf24',
  modulo: '#fbbf24',
  materia: '#a78bfa',
  aviso: '#fb7185',
};

/** Cita colgada de un bloque: vive afuera del `texto`, no como marcador. */
export type RefBloque = {
  tipo: TipoRef;
  id: string;
};

/**
 * Marcas de formato de un bloque: negrita, cursiva, subrayado y resaltado
 * ámbar. Se aplican al bloque y a su card del tablero.
 */
export type FormatoBloque = {
  b?: boolean;
  i?: boolean;
  u?: boolean;
  hl?: boolean;
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
  /** Marcas de formato. Los bloques viejos no lo traen: se lee como vacío. */
  fmt?: FormatoBloque;
  /** Cita a un módulo, otra materia o un aviso. `null` = sin referencia. */
  ref?: RefBloque | null;
};

export type Archivo = {
  id: string;
  materiaId: string;
  nombre: string;
  url: string;
};

/** Origen de una materia: cargada a mano o sincronizada desde el aula virtual (Moodle). */
export type SourceMateria = 'manual' | 'moodle';

/**
 * Un archivo de un módulo del aula virtual (adjunto de TP, PDF de un recurso…).
 *
 * `ref` es un identificador OPACO ("{cmid}:{indice}"): NO contiene la URL de
 * Moodle ni el token. Lo resuelve el proxy `/api/archivo?ref=…` del lado
 * servidor, que es el único que conoce la URL real.
 */
export type ArchivoModulo = {
  nombre: string;
  /** mimetype de Moodle ("application/pdf", "application/zip"…). */
  mime: string;
  /** Tamaño en bytes; 0 si Moodle no lo informa. */
  tamano: number;
  ref: string;
};

/**
 * Un ítem de una unidad del aula virtual (un `course_module` de Moodle).
 * Se muestra en la tab "Curso", desplegable para leer el material sin salir
 * de la app.
 */
export type ModuloCurso = {
  /** "mod:{cmid}" */
  id: string;
  nombre: string;
  /** `modname` de Moodle: resource, url, page, assign, quiz, forum, lesson, folder… */
  tipo: string;
  /** URL absoluta al módulo ("…/mod/{tipo}/view.php?id={cmid}"), NUNCA un fileurl. */
  url: string;
  /** `description` del módulo pasada a texto plano, solo si aporta algo. */
  descripcion?: string;
  /**
   * Contenido rico del módulo (page.content, assign.intro, url/lesson/quiz.intro)
   * YA SANITIZADO en el server (ver lib/moodle/contenido.ts). El cliente lo
   * inyecta tal cual: nunca vuelve a sanitizar.
   */
  html?: string;
  /** `externalurl` de un módulo `url` (playlist de YouTube, editor web…). */
  enlace?: string;
  /**
   * Video de YouTube detectado en el html o en `enlace`. Es el id pelado
   * ("TMeaRPvj_rA") para un video, o `"lista:{id}"` para una playlist.
   */
  video?: string;
  /** Archivos descargables del módulo, con `ref` opaca para el proxy. */
  archivos?: ArchivoModulo[];
  /**
   * Estado de finalización en el aula virtual, solo si el módulo TIENE
   * seguimiento activo. `undefined` = el profe no le puso seguimiento, así que
   * no se muestra nada (distinto de `false`, que es "pendiente" de verdad).
   */
  hecho?: boolean;
  /**
   * Qué pide el aula para darlo por hecho ("Ver", "Hacer un envío", "Completa
   * la actividad hasta el final"). El texto lo redacta Moodle, ya en castellano.
   */
  requisitos?: Requisito[];
};

/** Una condición de finalización y si ya la cumpliste. */
export type Requisito = {
  texto: string;
  cumplido: boolean;
};

/** Una unidad/sección del curso en el aula virtual ("Unidad 1", "Evaluaciones Generales"…). */
export type Seccion = {
  nombre: string;
  modulos: ModuloCurso[];
};

export type Materia = {
  id: string;
  nombre: string;
  profe: string;
  aula: string;
  color: ColorMateria;
  /** 'moodle' = vino del sync del aula virtual (nombre readonly, no se elimina). */
  source: SourceMateria;
  /**
   * URL del módulo de asistencia en el aula virtual
   * ("…/mod/attendance/view.php?id={cmid}"), si la materia tiene uno visible.
   * La app NO marca el presente: solo abre el módulo en el aula virtual.
   */
  asistenciaUrl?: string;
  /**
   * URL del módulo de Zoom de la comisión en el aula virtual
   * ("…/mod/zoom/view.php?id={cmid}"), si el curso tiene una sala de cursada
   * visible. Las salas de recuperatorio/examen NO se guardan acá.
   */
  claseUrl?: string;
  /**
   * Contenido del curso tal como está armado en el aula virtual: las unidades
   * con sus materiales. Los snapshots viejos no lo traen.
   */
  secciones?: Seccion[];
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
  /**
   * Id del bloque que lo originó, si el aviso nació de una nota. Si esa nota se
   * borra el aviso queda igual, solo sin snippet: nunca se borra en cascada
   * (avisos-manuales.json es la única copia).
   */
  notaId?: string | null;
};

/**
 * True si una fila (archivo o aviso) la cargó el usuario a mano y por lo tanto
 * se puede borrar. Las que vienen del aula virtual tienen ids con prefijo
 * ("mod:123", "assign:14782", "curso:2756") y las regenera el sync, así que no
 * se tocan. Los ids manuales son "manual:<uuid>" — sin prefijo de Moodle.
 */
export function esManual(id: string): boolean {
  return id.startsWith('manual:') || !id.includes(':');
}

export type Perfil = {
  nombre: string;
  /** Constante de lib/instituto.ts (la API del aula virtual no la expone); null en modo local. */
  carrera: string | null;
  instituto: string | null;
  /**
   * Sede real del alumno (custom field "1-Sede" del perfil de Moodle). Se
   * refresca al entrar; null hasta el primer login que la trae — ahí la UI cae
   * a la constante de lib/instituto.
   */
  sede: string | null;
  avatarUrl: string | null;
  /** ISO de cuándo aceptó el consentimiento del primer ingreso; null en modo local (no aplica). */
  consentimientoEn: string | null;
  /**
   * ISO de cuándo terminó (o salteó) el onboarding de 3 pasos. `null` = todavía
   * no lo vio, así que el overlay se muestra. El prototipo no persiste nada y lo
   * muestra en cada login; acá va una sola vez por persona (spec
   * `onboarding-y-salida` A1).
   */
  onboardingEn: string | null;
};
