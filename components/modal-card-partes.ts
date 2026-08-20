// Helpers de presentación que el modal de card comparte con el tablero
// (`ddmm`, `dominio`, colores y nombres de estado, catálogo de conversiones).
//
// Viven separados de `components/modal-card.tsx` por dos razones: la dependencia
// queda en una sola dirección (notas-editor → modal-card-partes) sin ciclo de
// imports, y el archivo de componentes exporta SOLO componentes, así Fast
// Refresh puede preservar el estado del modal al editarlo.

import type { ItemRef } from '@/lib/referencias';
import { COLOR_REF, type EstadoBloque, type RefBloque, type TipoBloque } from '@/lib/types';

export const COLOR_ESTADO: Record<EstadoBloque, string> = {
  pendiente: '#64748b',
  proceso: '#38bdf8',
  listo: '#34d399',
};

export const NOMBRE_ESTADO: Record<EstadoBloque, string> = {
  pendiente: 'Por hacer',
  proceso: 'En proceso',
  listo: 'Listo',
};

/** Color del badge de estado del header: `--tx3` para "Por hacer". */
export const COLOR_BADGE: Record<EstadoBloque, string> = {
  pendiente: 'var(--tx3)',
  proceso: '#38bdf8',
  listo: '#34d399',
};

/** Cómo se lee cada tipo en el badge del header. */
export const NOMBRE_TIPO_BADGE: Record<TipoBloque, string> = {
  texto: 'Nota',
  titulo: 'Título',
  tarea: 'Tarea',
  link: 'Link',
  ref: 'Nota',
  divisor: 'Nota',
};

/** ISO → 'dd/mm' para el header del modal y el pie de las cards. */
export function ddmm(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Dominio de una URL para el favicon y la subfila mono. */
export function dominio(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** 'YYYY-MM-DD' → 'dd/mm', sin construir un Date (no depende de la zona). */
export function ddmmFecha(f: string): string {
  return `${f.slice(8, 10)}/${f.slice(5, 7)}`;
}

/** Cuánto queda armada una confirmación de borrado antes de desarmarse sola. */
export const MS_CONFIRMAR = 3000;

// ---------------------------------------------------------------------------
// Menú "Convertir en"
// ---------------------------------------------------------------------------

export type Conversion = {
  tipo: TipoBloque;
  glifo: string;
  nombre: string;
  cmd: string;
  /** Las mismas keywords del composer: `/todo` y `/checkbox` encuentran Tarea. */
  claves: string;
};

export const CONVERSIONES: Conversion[] = [
  { tipo: 'texto', glifo: 'T', nombre: 'Texto', cmd: '/texto', claves: 'texto nota parrafo' },
  { tipo: 'titulo', glifo: '#', nombre: 'Título', cmd: '/titulo', claves: 'titulo encabezado' },
  {
    tipo: 'tarea',
    glifo: '✓',
    nombre: 'Tarea',
    cmd: '/tarea',
    claves: 'tarea pendiente check todo to-do checkbox',
  },
  { tipo: 'link', glifo: '↗', nombre: 'Link', cmd: '/link', claves: 'link url preview' },
];

/**
 * Saca el `/comando` que abrió el menú y devuelve el resto del texto.
 *
 * El prototipo vacía el texto al convertir (`x.texto=''`): acá no, convertir
 * conserva lo escrito (spec §2). Pero el token que abrió el menú sí se va —
 * quedaría "/link" como nombre del link. Solo se saca si ese token ES el
 * comando elegido: "/etc/passwd de la VM" se conserva entero.
 */
export function sinComando(texto: string, c: Conversion): string {
  const m = /^\/(\S*)\s*/.exec(texto);
  if (!m) return texto;
  const token = (m[1] ?? '').toLowerCase();
  if (token && !c.cmd.slice(1).includes(token) && !c.claves.includes(token)) return texto;
  return texto.slice(m[0].length);
}

/** Resuelve una cita contra el catálogo: nombre y color con los que se pinta. */
export function verRef(ref: RefBloque, catalogo: ItemRef[]): { nombre: string; color: string } {
  const item = catalogo.find((c) => c.ref.tipo === ref.tipo && c.ref.id === ref.id);
  // Sin catálogo (o citando algo que ya no está) se muestra el id: es mejor
  // que borrar la cita en silencio.
  return { nombre: item?.nombre ?? ref.id, color: item?.color ?? COLOR_REF[ref.tipo] };
}
