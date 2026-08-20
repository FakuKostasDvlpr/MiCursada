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
  // Es String.includes (búsqueda de substring sobre el texto que arma `plano`), no Array.includes:
  // no hay lookup por igualdad que un Set pueda reemplazar.
  // react-doctor-disable-next-line react-doctor/js-set-map-lookups
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
  /** Lo que se lee en mono a la derecha ("Tarea", "materia", "aviso"). */
  kind: string;
  color: string;
};

export type EntradaCatalogo = {
  /** Unidades y módulos de la materia que se está editando. */
  secciones?: Seccion[];
  /** Todas las materias de la cursada (la actual se excluye sola). */
  materias: { id: string; nombre: string; color: string }[];
  materiaActualId: string;
  /** Todos los avisos; los hechos no se ofrecen. */
  avisos: { id: string; titulo: string; hecho: boolean }[];
};

/**
 * Lo citable con `@`, en el orden del prototipo: primero el curso, después las
 * otras materias, y al final los avisos que siguen pendientes.
 */
export function catalogoRefs(entrada: EntradaCatalogo): ItemRef[] {
  const items: ItemRef[] = [];

  for (const c of catalogoCurso(entrada.secciones ?? [])) {
    items.push({
      ref: { tipo: 'modulo', id: c.id },
      nombre: c.nombre,
      kind: c.etiqueta,
      color: COLOR_REF.modulo,
    });
  }

  for (const m of entrada.materias) {
    if (m.id === entrada.materiaActualId) continue;
    items.push({
      ref: { tipo: 'materia', id: m.id },
      nombre: m.nombre,
      kind: 'materia',
      // El chip toma el color de esa materia, no el genérico del tipo.
      color: m.color || COLOR_REF.materia,
    });
  }

  for (const a of entrada.avisos) {
    if (a.hecho) continue;
    items.push({
      ref: { tipo: 'aviso', id: a.id },
      nombre: a.titulo,
      kind: 'aviso',
      color: COLOR_REF.aviso,
    });
  }

  return items;
}

/** Filtra el catálogo del `@` y corta en `limite` (7 en el composer, 5 en el modal). */
export function buscarRefs(catalogo: ItemRef[], consulta: string, limite: number): ItemRef[] {
  const q = plano(consulta.trim());
  const filtrados = q
    ? // String.includes (substring), no Array.includes: un Set no aplica.
      // react-doctor-disable-next-line react-doctor/js-set-map-lookups
      catalogo.filter((c) => plano(`${c.nombre} ${c.kind}`).includes(q))
    : catalogo;
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
