// Grafo de la cursada — la red estilo Obsidian del handoff (§5 "Grafo").
//
// Acá vive solo la parte pura: armar los nodos/aristas a partir de las materias
// y los avisos, y el paso de la simulación de fuerzas. El componente
// (components/grafo.tsx) se encarga del rAF, del hover y del tooltip.
//
// La simulación es propia, sin librería, con los parámetros del handoff:
// repulsión de Coulomb entre todos los nodos, resortes en las aristas,
// gravedad suave al centro, damping y enfriamiento hasta detenerse.

import type { Aviso, Materia } from '@/lib/types';

/** Lienzo del SVG (viewBox 0 0 760 560). */
export const ANCHO = 760;
export const ALTO = 560;
export const CENTRO_X = 380;
export const CENTRO_Y = 270;

/** Márgenes: ningún nodo se va del lienzo. */
const MARGEN_X = 18;
const MARGEN_Y = 18;

/** Largo natural de los resortes. */
const LARGO_CENTRO_MATERIA = 165;
const LARGO_MATERIA_ITEM = 48;

export type TipoNodo = 'yo' | 'materia' | 'nota' | 'archivo' | 'aviso';

export type NodoGrafo = {
  id: string;
  tipo: TipoNodo;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  /** Color de la materia (el nodo central va en ámbar). */
  color: string;
  /** Materia de la que cuelga. Para una materia, su propio id. Para "yo", null. */
  materiaId: string | null;
  /** Rótulo corto que se dibuja debajo del nodo. */
  rotulo: string;
  /** Título completo del tooltip. */
  titulo: string;
  /** Dato contextual del tooltip ("22/09 · pendiente", el dominio, …). */
  sub: string;
  /** Nombre de la materia, para el kicker del tooltip. */
  materiaNombre: string;
  /** A dónde lleva el click, o null si no es clickeable (el nodo central). */
  href: string | null;
};

export type AristaGrafo = {
  a: NodoGrafo;
  b: NodoGrafo;
  /** Largo natural del resorte. */
  largo: number;
};

export type Grafo = {
  nodos: NodoGrafo[];
  aristas: AristaGrafo[];
  /** Temperatura de la simulación: arranca en 1 y se enfría hasta 0.02. */
  alfa: number;
};

/** Debajo de esto la simulación ya está asentada y se puede parar el rAF. */
export const ALFA_QUIETA = 0.025;

/**
 * Dispersión inicial de un ítem alrededor de su materia. El prototipo usa
 * Math.random(); acá va un hash del id porque el mismo grafo se arma en cada
 * render y una posición al azar haría saltar todo (y rompería la hidratación).
 */
function dispersion(id: string, eje: number): number {
  let h = 2166136261 ^ eje;
  for (let i = 0; i < id.length; i++) {
    h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  }
  // >>> 0 para quedarnos con el entero sin signo, y de ahí a [-0.5, 0.5).
  return ((h >>> 0) % 1000) / 1000 - 0.5;
}

const cortar = (txt: string, max: number) =>
  txt.length > max ? `${txt.slice(0, max - 1)}…` : txt;

/** 'YYYY-MM-DD' → 'dd/mm'. */
const ddmm = (fecha: string) => `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`;

/** ISO → 'dd/mm' en horario local (las notas guardan createdAt en ISO). */
function ddmmIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const ESTADO_TXT = {
  pendiente: 'por hacer',
  proceso: 'en proceso',
  listo: 'listo',
} as const;

/** Dominio de una URL, o la URL cruda si no parsea. */
function dominio(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * Firma de los datos que alimentan el grafo. Si no cambió, no hace falta
 * rearmarlo (y las posiciones ya calculadas se conservan).
 */
export function firmaGrafo(materias: Materia[], avisos: Aviso[]): string {
  const m = materias
    .map((x) => `${x.id}:${x.bloques.length}:${x.archivos.length}`)
    .join('|');
  const pendientes: string[] = [];
  for (const x of avisos) {
    if (!x.hecho) pendientes.push(x.id);
  }
  const a = pendientes.join(',');
  return `${m}#${a}`;
}

/** Totales del encabezado de la pantalla. */
export function totalesGrafo(materias: Materia[], avisos: Aviso[]) {
  return {
    materias: materias.length,
    notas: materias.reduce(
      (n, m) => n + m.bloques.filter((b) => b.tipo !== 'divisor').length,
      0
    ),
    archivos: materias.reduce((n, m) => n + m.archivos.length, 0),
    avisos: avisos.filter((a) => !a.hecho).length,
  };
}

/**
 * Arma la red: vos al centro → una materia por cada materia → un ítem por cada
 * nota, archivo y aviso pendiente de esa materia.
 */
export function armarGrafo(
  materias: Materia[],
  avisos: Aviso[],
  inicialesUsuario: string
): Grafo {
  const nodos: NodoGrafo[] = [];
  const aristas: AristaGrafo[] = [];

  const yo: NodoGrafo = {
    id: 'yo',
    tipo: 'yo',
    x: CENTRO_X,
    y: CENTRO_Y,
    vx: 0,
    vy: 0,
    r: 24,
    color: '#fbbf24',
    materiaId: null,
    rotulo: inicialesUsuario || 'YO',
    titulo: '',
    sub: '',
    materiaNombre: '',
    href: null,
  };
  nodos.push(yo);

  materias.forEach((m, i) => {
    // Ángulo áureo: las materias arrancan repartidas y la simulación no tiene
    // que deshacer un amontonamiento inicial.
    const ang = i * 2.399963;
    const mx = CENTRO_X + Math.cos(ang) * 170;
    const my = CENTRO_Y + Math.sin(ang) * 115;

    const notas = m.bloques.filter((b) => b.tipo !== 'divisor');
    const avisosMateria = avisos.filter((a) => a.materiaId === m.id && !a.hecho);
    const total = notas.length + m.archivos.length + avisosMateria.length;

    const nodoMateria: NodoGrafo = {
      id: m.id,
      tipo: 'materia',
      x: mx,
      y: my,
      vx: 0,
      vy: 0,
      r: 13 + Math.min(12, total * 1.3),
      color: m.color,
      materiaId: m.id,
      rotulo: cortar(m.nombre, 22),
      titulo: m.nombre,
      sub: `${m.profe || '—'} · ${m.aula || '—'} · ${total} ítems`,
      materiaNombre: m.nombre,
      href: `/materias/${encodeURIComponent(m.id)}`,
    };
    nodos.push(nodoMateria);
    aristas.push({ a: yo, b: nodoMateria, largo: LARGO_CENTRO_MATERIA });

    const item = (
      id: string,
      tipo: Exclude<TipoNodo, 'yo' | 'materia'>,
      etiqueta: string,
      r: number,
      sub: string,
      // A dónde lleva el click. Por defecto, la materia; una nota puede
      // apuntar directo a sí misma con `?nota=<id>`, que es lo que uno espera
      // al hacer click en su puntito y no "te dejo en la materia, buscala".
      href = `/materias/${encodeURIComponent(m.id)}`
    ) => {
      const nodo: NodoGrafo = {
        id,
        tipo,
        x: mx + dispersion(id, 1) * 80,
        y: my + dispersion(id, 2) * 80,
        vx: 0,
        vy: 0,
        r,
        color: m.color,
        materiaId: m.id,
        rotulo: cortar(etiqueta, 18),
        titulo: cortar(etiqueta, 70),
        sub,
        materiaNombre: m.nombre,
        href,
      };
      nodos.push(nodo);
      aristas.push({ a: nodoMateria, b: nodo, largo: LARGO_MATERIA_ITEM });
    };

    for (const b of notas) {
      item(
        `n${b.id}`,
        'nota',
        b.texto || 'nota',
        5,
        `${ddmmIso(b.createdAt)} · ${ESTADO_TXT[b.estado] ?? 'por hacer'}`,
        `/materias/${encodeURIComponent(m.id)}?nota=${encodeURIComponent(b.id)}`
      );
    }
    for (const f of m.archivos) {
      // Los archivos del aula virtual llevan id `mod:{cmid}` (o
      // `mod:{cmid}:{filename}` si vienen de una carpeta): el click abre ESE
      // módulo en la tab Curso. Los manuales (id de la base) van a su tab.
      const cmid = f.id.startsWith('mod:') ? f.id.split(':')[1] : null;
      item(
        `f${f.id}`,
        'archivo',
        f.nombre,
        4.5,
        dominio(f.url),
        cmid
          ? `/materias/${encodeURIComponent(m.id)}?modulo=${encodeURIComponent(`mod:${cmid}`)}`
          : `/materias/${encodeURIComponent(m.id)}?tab=archivos`
      );
    }
    for (const a of avisosMateria) {
      item(
        `a${a.id}`,
        'aviso',
        a.titulo,
        5,
        `${ddmm(a.fecha)} · pendiente`,
        `/materias/${encodeURIComponent(m.id)}?tab=avisos`
      );
    }
  });

  return { nodos, aristas, alfa: 1 };
}

/**
 * Un paso de la simulación. Muta el grafo (se llama una vez por frame y
 * asignar objetos nuevos en cada tick sería tirar basura al GC de gusto).
 */
export function tickGrafo(g: Grafo): void {
  const al = g.alfa;

  // Repulsión de Coulomb entre todos los pares, cortada a d > 190 (36000 = 190²)
  // para no pagar el par completo cuando la fuerza ya es despreciable.
  const nodos = g.nodos;
  for (let i = 0; i < nodos.length; i++) {
    const a = nodos[i];
    if (!a) continue;
    for (let j = i + 1; j < nodos.length; j++) {
      const b = nodos[j];
      if (!b) continue;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      let d2 = dx * dx + dy * dy;
      if (d2 < 1) d2 = 1;
      if (d2 > 36000) continue;
      const d = Math.sqrt(d2);
      const f = (1500 * al) / d2;
      const fx = (dx / d) * f;
      const fy = (dy / d) * f;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }
  }

  // Resortes de las aristas.
  for (const l of g.aristas) {
    const dx = l.b.x - l.a.x;
    const dy = l.b.y - l.a.y;
    const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
    const f = (d - l.largo) * 0.028 * al;
    const fx = (dx / d) * f;
    const fy = (dy / d) * f;
    l.a.vx += fx;
    l.a.vy += fy;
    l.b.vx -= fx;
    l.b.vy -= fy;
  }

  // Gravedad al centro, damping e integración.
  for (const n of g.nodos) {
    if (n.tipo === 'yo') {
      n.x = CENTRO_X;
      n.y = CENTRO_Y;
      n.vx = 0;
      n.vy = 0;
      continue;
    }
    n.vx += (CENTRO_X - n.x) * 0.0012 * al;
    n.vy += (CENTRO_Y - n.y) * 0.0012 * al;
    n.vx *= 0.86;
    n.vy *= 0.86;
    n.x += n.vx;
    n.y += n.vy;
    n.x = Math.max(MARGEN_X, Math.min(ANCHO - MARGEN_X, n.x));
    n.y = Math.max(MARGEN_Y, Math.min(ALTO - MARGEN_Y, n.y));
  }

  g.alfa = Math.max(g.alfa * 0.99, 0.02);
}

/**
 * Cadena encendida al pasar el mouse por un nodo: el ítem, su materia y el
 * centro. Sobre una materia se enciende la rama entera; sobre "yo", todo.
 */
export function cadenaEncendida(g: Grafo, hoverId: string | null): Set<string> {
  const set = new Set<string>();
  if (!hoverId) return set;
  const nodo = g.nodos.find((n) => n.id === hoverId);
  if (!nodo) return set;

  if (nodo.tipo === 'yo') {
    for (const n of g.nodos) set.add(n.id);
    return set;
  }
  if (nodo.tipo === 'materia') {
    set.add(nodo.id);
    set.add('yo');
    for (const n of g.nodos) if (n.materiaId === nodo.id) set.add(n.id);
    return set;
  }
  set.add(nodo.id);
  if (nodo.materiaId) set.add(nodo.materiaId);
  set.add('yo');
  return set;
}
