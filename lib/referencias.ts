// Referencias al contenido del curso desde las notas.
//
// Una nota puede citar un módulo del aula virtual (un TP, un cuestionario, un
// apunte) o una unidad entera. La cita se guarda como un marcador adentro del
// `texto` del bloque — no hay campo nuevo ni tabla nueva:
//
//     [[mod:1234|Trabajo Práctico Nº 2]]
//        └─ id     └─ nombre al momento de citarlo
//
// El id es la fuente de verdad; el nombre es solo un fallback para cuando el
// módulo ya no está en el aula virtual (lo borraron, cambió el curso). Al
// renderizar SIEMPRE se re-resuelve contra `materia.secciones`, así un módulo
// renombrado se ve con su nombre nuevo sin tocar la nota.
//
// El mismo marcador sirve para las dos formas de la UI: suelto en medio de un
// párrafo (chip) o como único contenido de un bloque `ref` (card).

import { COLOR_REF, type RefBloque, type Seccion } from '@/lib/types';

/** Un módulo o una unidad, listos para mostrar. */
export type ItemCurso = {
  /** "mod:{cmid}" para un módulo, "sec:{indice}" para una unidad. */
  id: string;
  tipo: 'modulo' | 'unidad';
  nombre: string;
  /** Etiqueta en castellano del tipo ("Tarea", "Cuestionario", "Unidad"). */
  etiqueta: string;
  /** Unidad a la que pertenece. Para una unidad, su propio nombre. */
  unidad: string;
  /** true si se resolvió contra el aula virtual; false si es el nombre cacheado. */
  vive: boolean;
};

/** `modname` de Moodle → cómo lo llamamos nosotros. */
const ETIQUETA: Record<string, string> = {
  assign: 'Tarea',
  quiz: 'Cuestionario',
  resource: 'Material',
  url: 'Enlace',
  page: 'Página',
  lesson: 'Lección',
  book: 'Libro',
  forum: 'Foro',
  folder: 'Carpeta',
  label: 'Nota',
  choice: 'Consulta',
  feedback: 'Encuesta',
  workshop: 'Taller',
  attendance: 'Asistencia',
  zoom: 'Clase',
};

export const etiquetaModulo = (modname: string) => ETIQUETA[modname] ?? 'Material';

/**
 * El marcador. El id no puede tener `|` ni `]`, y el nombre no puede tener `]`:
 * los ids de Moodle son "mod:1234" y los nombres de módulo no traen corchetes.
 */
const MARCADOR = /\[\[((?:mod|sec):[^|\]]+)\|([^\]]*)\]\]/g;

/** El texto de un marcador para pegar en una nota. */
export function marcador(item: { id: string; nombre: string }): string {
  // Un `]` o un `|` en el nombre partirían el marcador al leerlo de vuelta.
  const limpio = item.nombre
    .replace(/[[\]|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return `[[${item.id}|${limpio}]]`;
}

export type Trozo =
  | { t: 'texto'; texto: string }
  | { t: 'ref'; id: string; nombre: string };

/** Parte un texto en trozos de texto plano y referencias, en orden. */
export function partir(texto: string): Trozo[] {
  const trozos: Trozo[] = [];
  let ultimo = 0;
  for (const m of texto.matchAll(MARCADOR)) {
    const desde = m.index ?? 0;
    if (desde > ultimo) trozos.push({ t: 'texto', texto: texto.slice(ultimo, desde) });
    trozos.push({ t: 'ref', id: m[1] ?? '', nombre: m[2] ?? '' });
    ultimo = desde + m[0].length;
  }
  if (ultimo < texto.length) trozos.push({ t: 'texto', texto: texto.slice(ultimo) });
  return trozos;
}

/** ¿El texto tiene al menos una referencia? */
export function tieneRefs(texto: string): boolean {
  return partir(texto).some((t) => t.t === 'ref');
}

/**
 * La referencia, si el texto es EXACTAMENTE un marcador (con espacios alrededor
 * a lo sumo). Es lo que distingue a un bloque `ref` de un texto que la cita.
 */
export function refUnica(texto: string): { id: string; nombre: string } | null {
  const trozos = partir(texto.trim());
  const uno = trozos[0];
  if (trozos.length !== 1 || !uno || uno.t !== 'ref') return null;
  return { id: uno.id, nombre: uno.nombre };
}

/** El texto con los marcadores reemplazados por su nombre (búsqueda, resúmenes). */
export function textoPlano(texto: string): string {
  return partir(texto)
    .map((t) => (t.t === 'texto' ? t.texto : t.nombre))
    .join('');
}

/** Todo lo citable de una materia: sus unidades y sus módulos. */
export function catalogoCurso(secciones: Seccion[]): ItemCurso[] {
  const items: ItemCurso[] = [];
  secciones.forEach((s, i) => {
    const unidad = s.nombre || 'Sin título';
    items.push({
      id: `sec:${i}`,
      tipo: 'unidad',
      nombre: unidad,
      etiqueta: 'Unidad',
      unidad,
      vive: true,
    });
    for (const m of s.modulos) {
      items.push({
        id: m.id,
        tipo: 'modulo',
        nombre: m.nombre,
        etiqueta: etiquetaModulo(m.tipo),
        unidad,
        vive: true,
      });
    }
  });
  return items;
}

/**
 * Resuelve una referencia contra el curso de hoy. Si el ítem ya no está,
 * devuelve el nombre cacheado con `vive: false` — la nota nunca se rompe.
 *
 * Las unidades no tienen id propio en Moodle, así que se buscan primero por
 * nombre (sobrevive a que las reordenen) y recién después por índice.
 */
export function resolverRef(
  id: string,
  nombreCacheado: string,
  secciones: Seccion[]
): ItemCurso {
  const catalogo = catalogoCurso(secciones);

  if (id.startsWith('sec:')) {
    const porNombre = catalogo.find((c) => c.tipo === 'unidad' && c.nombre === nombreCacheado);
    if (porNombre) return porNombre;
  }

  const exacto = catalogo.find((c) => c.id === id);
  if (exacto) return exacto;

  return {
    id,
    tipo: id.startsWith('sec:') ? 'unidad' : 'modulo',
    nombre: nombreCacheado,
    etiqueta: id.startsWith('sec:') ? 'Unidad' : 'Material',
    unidad: '',
    vive: false,
  };
}

/** Normaliza para buscar sin acentos ni mayúsculas. */
const plano = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/**
 * Filtra el catálogo por lo que se escribió después del `@`. Con la consulta
 * vacía devuelve todo (el menú se abre mostrando el curso entero).
 */
export function buscarEnCatalogo(catalogo: ItemCurso[], consulta: string): ItemCurso[] {
  const q = plano(consulta.trim());
  if (!q) return catalogo;
  return catalogo.filter((c) => plano(`${c.nombre} ${c.etiqueta} ${c.unidad}`).includes(q));
}

/**
 * La palabra `@…` que está pegada al cursor, o null. Sirve para decidir si el
 * menú de menciones tiene que estar abierto y qué se está filtrando.
 *
 * Solo cuenta si el `@` arranca palabra (principio del texto o después de un
 * espacio o un salto), para no disparar el menú en medio de un mail.
 */
export function mencionEnCursor(
  texto: string,
  cursor: number
): { desde: number; hasta: number; consulta: string } | null {
  const antes = texto.slice(0, cursor);
  const arroba = antes.lastIndexOf('@');
  if (arroba === -1) return null;

  const previo = arroba === 0 ? '' : antes.charAt(arroba - 1);
  if (previo && !/\s/.test(previo)) return null;

  const consulta = antes.slice(arroba + 1);
  // Un salto de línea cierra la mención; los espacios no, para poder escribir
  // "@trabajo practico" y que siga filtrando.
  if (/\n/.test(consulta)) return null;

  return { desde: arroba, hasta: cursor, consulta };
}

// ---------------------------------------------------------------------------
// Catálogo del `@` del diseño del 17/08
//
// El `@` dejó de escribir un marcador adentro del texto: ahora adjunta una cita
// al bloque (campo `ref`). Y se puede citar tres cosas, no una: un módulo del
// aula virtual, OTRA materia, o un aviso pendiente. Los marcadores `[[…]]` de
// arriba siguen vivos para lo ya escrito.
// ---------------------------------------------------------------------------

/** Una opción del menú `@`, lista para mostrar. */
export type ItemRef = {
  ref: RefBloque;
  nombre: string;
  /** Lo que se lee en mono a la derecha ("PDF", "Tarea", "materia", "aviso"). */
  kind: string;
  color: string;
  /**
   * Dónde vive, para no mostrar veinte nombres sueltos sin jerarquía:
   * "Unidad 2 › Guía de ejercicios" para un archivo, "Unidad 2" para un módulo.
   * Vacío para lo que no cuelga de ninguna unidad.
   */
  contexto: string;
  /**
   * ¿Se OFRECE en el menú `@` y en el select de Referencia?
   *
   * El catálogo cumple dos funciones distintas y hay ítems que sirven para una
   * sola: resolver el chip de una nota ya escrita (`verRef` busca acá) y ofrecer
   * qué citar. Las otras materias y los avisos ajenos ya NO se ofrecen — desde
   * una materia se cita lo de esa materia — pero tienen que seguir resolviendo,
   * o una nota vieja pasaría a mostrar "curso:2756" en crudo.
   */
  ofrecer: boolean;
};

/** La unidad de un archivo o módulo, para el `contexto`. */
const SEP = ' › ';

export type EntradaCatalogo = {
  /** Unidades, módulos y archivos de la materia que se está editando. */
  secciones?: Seccion[];
  /** Materias de la cursada: solo para resolver citas viejas, no se ofrecen. */
  materias: { id: string; nombre: string; color: string }[];
  materiaActualId: string;
  /** Todos los avisos: solo se ofrecen los de esta materia que siguen pendientes. */
  avisos: { id: string; titulo: string; hecho: boolean; materiaId?: string | null }[];
};

/**
 * Lo citable desde una nota de ESTA materia: sus archivos (el "TP2.pdf" del
 * aula), sus unidades y módulos, y sus avisos pendientes. Nada de otras
 * materias: si estás tomando nota en Matemáticas, el menú es de Matemáticas.
 *
 * Los ítems de otras materias igual entran al catálogo con `ofrecer: false`,
 * porque el catálogo es también lo que resuelve los chips ya guardados.
 */
export function catalogoRefs(entrada: EntradaCatalogo): ItemRef[] {
  const items: ItemRef[] = [];
  const secciones = entrada.secciones ?? [];

  // El curso, en el orden en que está armado en el aula virtual: cada unidad,
  // sus módulos, y los archivos colgando del módulo que los contiene.
  secciones.forEach((s, i) => {
    const unidad = s.nombre || 'Sin título';
    items.push({
      ref: { tipo: 'modulo', id: `sec:${i}` },
      nombre: unidad,
      kind: 'Unidad',
      color: COLOR_REF.modulo,
      contexto: '',
      ofrecer: true,
    });

    for (const m of s.modulos) {
      items.push({
        ref: { tipo: 'modulo', id: m.id },
        nombre: m.nombre,
        kind: etiquetaModulo(m.tipo),
        color: COLOR_REF.modulo,
        contexto: unidad,
        ofrecer: true,
      });

      for (const a of m.archivos ?? []) {
        items.push({
          ref: { tipo: 'archivo', id: a.ref },
          nombre: a.nombre,
          kind: kindArchivo(a.nombre, a.mime),
          color: COLOR_REF.archivo,
          contexto: `${unidad}${SEP}${m.nombre}`,
          ofrecer: true,
        });
      }
    }
  });

  for (const m of entrada.materias) {
    if (m.id === entrada.materiaActualId) continue;
    items.push({
      ref: { tipo: 'materia', id: m.id },
      nombre: m.nombre,
      kind: 'materia',
      // El chip toma el color de esa materia, no el genérico del tipo.
      color: m.color || COLOR_REF.materia,
      contexto: '',
      ofrecer: false,
    });
  }

  for (const a of entrada.avisos) {
    items.push({
      ref: { tipo: 'aviso', id: a.id },
      nombre: a.titulo,
      kind: 'aviso',
      color: COLOR_REF.aviso,
      contexto: '',
      // Un aviso hecho no se ofrece (ya no hay nada que citar), y uno de otra
      // materia tampoco: entra solo para resolver.
      ofrecer: !a.hecho && a.materiaId === entrada.materiaActualId,
    });
  }

  return items;
}

/** "PDF" / "ZIP" / "DOCX" a partir del nombre, cayendo al mime si no hay extensión. */
export function kindArchivo(nombre: string, mime: string): string {
  const ext = nombre.includes('.') ? (nombre.split('.').pop() ?? '') : '';
  if (ext && ext.length <= 5) return ext.toUpperCase();
  const cola = mime.split('/').pop() ?? '';
  return cola ? cola.toUpperCase().slice(0, 5) : 'Archivo';
}

/** Solo lo que el menú y el select tienen que ofrecer. */
export function ofrecibles(catalogo: ItemRef[]): ItemRef[] {
  return catalogo.filter((c) => c.ofrecer);
}

/**
 * Filtra lo ofrecible del catálogo y corta en `limite` (7 en el composer, 5 en
 * el modal). La búsqueda mira también el contexto, así "unidad 2" trae todo lo
 * de esa unidad.
 */
export function buscarRefs(catalogo: ItemRef[], consulta: string, limite: number): ItemRef[] {
  const q = plano(consulta.trim());
  const base = ofrecibles(catalogo);
  const filtrados = q
    ? base.filter((c) => plano(`${c.nombre} ${c.kind} ${c.contexto}`).includes(q))
    : base;
  return filtrados.slice(0, limite);
}

/** Reemplaza la mención en curso por el marcador del ítem elegido. */
export function insertarMencion(
  texto: string,
  rango: { desde: number; hasta: number },
  item: { id: string; nombre: string }
): { texto: string; cursor: number } {
  const marca = `${marcador(item)} `;
  const nuevo = texto.slice(0, rango.desde) + marca + texto.slice(rango.hasta);
  return { texto: nuevo, cursor: rango.desde + marca.length };
}
