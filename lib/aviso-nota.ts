// Avisos que nacen de una nota (diseño del 17/08).
//
// Un aviso creado desde el modal de una card es un aviso manual con un campo
// más (`notaId`). El título sale del texto de la nota, recortado, porque una
// nota puede ser un párrafo entero y el aviso es una fila de una línea.

import type { EstadoAviso } from '@/lib/cursada';
import type { Bloque, EstadoBloque, TipoBloque } from '@/lib/types';

/** Largo máximo del título antes de recortar. */
export const LARGO_TITULO = 60;

/** Título de un aviso creado desde una nota, con el recorte del prototipo. */
export function tituloDesdeNota(texto: string): string {
  const limpio = texto.trim();
  if (!limpio) return 'Nota sin título';
  // El prototipo corta en 59 y agrega el puntito: 60 caracteres en total.
  if (limpio.length > LARGO_TITULO) return `${limpio.slice(0, LARGO_TITULO - 1)}…`;
  return limpio;
}

/** Cómo se llama cada tipo de bloque en el snippet del aviso. */
const NOMBRE_TIPO_NOTA: Record<TipoBloque, string> = {
  texto: 'nota',
  titulo: 'título',
  tarea: 'to-do',
  link: 'link',
  ref: 'del curso',
  divisor: 'divisor',
};

/** Nombre y color del estado de la nota, en minúscula como en el snippet. */
const ESTADO_NOTA: Record<EstadoBloque, { nombre: string; color: string }> = {
  pendiente: { nombre: 'por hacer', color: '#64748b' },
  proceso: { nombre: 'en proceso', color: '#38bdf8' },
  listo: { nombre: 'listo', color: '#34d399' },
};

/**
 * Badge de estado del modal grande de aviso (spec `onboarding-y-salida` R7.5).
 * El orden de precedencia lo define `estadoAviso()`: `hecho` gana siempre, y
 * la comparación de fechas ya viene hecha en Buenos Aires.
 *
 * El color va como token CSS donde existe (`--acc`, `--vencido`, `--tx2`) y
 * como hex solo el verde, que no tiene variable.
 */
const BADGE_AVISO: Record<EstadoAviso, { texto: string; color: string }> = {
  hecho: { texto: 'Hecho', color: '#34d399' },
  vencido: { texto: 'Vencido', color: 'var(--vencido)' },
  hoy: { texto: 'Vence hoy', color: 'var(--acc)' },
  pendiente: { texto: 'Pendiente', color: 'var(--tx2)' },
};

export const badgeAviso = (estado: EstadoAviso): { texto: string; color: string } =>
  BADGE_AVISO[estado];

/** 'YYYY-MM-DD' → 'dd/mm/yyyy', el formato largo del modal (R7.4). */
export function fechaLargaAviso(fecha: string): string {
  const [a, m, d] = fecha.split('-');
  if (!a || !m || !d) return fecha;
  return `${d}/${m}/${a}`;
}

export type ResumenNota = {
  texto: string;
  tipo: string;
  estadoNombre: string;
  estadoColor: string;
};

/**
 * Lo que muestra el snippet `NotaAviso`. Un bloque `hecho` se lee como "listo"
 * aunque su `estado` diga otra cosa, igual que en el prototipo.
 */
export function resumenNota(bloque: Bloque): ResumenNota {
  const estado = ESTADO_NOTA[bloque.hecho ? 'listo' : bloque.estado];
  return {
    texto: bloque.texto.trim() || 'Sin título',
    tipo: NOMBRE_TIPO_NOTA[bloque.tipo],
    estadoNombre: estado.nombre,
    estadoColor: estado.color,
  };
}
