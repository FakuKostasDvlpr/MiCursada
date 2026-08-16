// Bitácora de clase: agrupa los bloques de notas por día calendario de Buenos
// Aires, derivando el día desde `createdAt`. No hace falta ningún proceso a
// medianoche: el "cierre" del día es una consecuencia de agrupar por fecha.
//
// Funciones puras, sin I/O. `ahora` siempre llega por parámetro (igual que
// lib/cursada.ts) para que los tests pasen en cualquier timezone de máquina.

import { toZonedTime } from 'date-fns-tz';
import { nombreDia, TZ } from '@/lib/cursada';
import type { Bloque } from '@/lib/types';

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const;

/** Clave del grupo de los bloques sin `createdAt` usable. Va siempre al final. */
export const DIA_SIN_FECHA = '';

/** Etiqueta del grupo sin fecha. */
export const ETIQUETA_SIN_FECHA = 'Sin fecha';

const dosDig = (n: number) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' de una fecha de pared. */
function isoDePared(d: Date): string {
  return `${d.getFullYear()}-${dosDig(d.getMonth() + 1)}-${dosDig(d.getDate())}`;
}

/** 'YYYY-MM-DD' en Buenos Aires de un instante, o `DIA_SIN_FECHA` si no es fecha. */
function isoEnBA(instante: Date): string {
  if (Number.isNaN(instante.getTime())) return DIA_SIN_FECHA;
  return isoDePared(toZonedTime(instante, TZ));
}

/**
 * Día calendario (Buenos Aires) al que pertenece un bloque, según su `createdAt`.
 * Si falta o es inválido devuelve `DIA_SIN_FECHA` ('') — nunca tira.
 */
export function diaDeBloque(bloque: Pick<Bloque, 'createdAt'>): string {
  const crudo = bloque.createdAt;
  if (typeof crudo !== 'string' || crudo.trim() === '') return DIA_SIN_FECHA;
  return isoEnBA(new Date(crudo));
}

/** 'YYYY-MM-DD' de hoy en BA, corrido `off` días (negativo = atrás). */
function isoOffset(ahora: Date, off: number): string {
  const local = toZonedTime(ahora, TZ);
  const d = new Date(local);
  d.setDate(local.getDate() + off);
  return isoDePared(d);
}

/** Día de la semana (0=Domingo … 6=Sábado) de un 'YYYY-MM-DD', sin tocar la TZ del proceso. */
function diaSemanaDeIso(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay();
}

/**
 * "Hoy" / "Ayer" / "Jueves 13 de agosto". Si el año del día no es el de `ahora`,
 * se agrega ("Jueves 13 de agosto de 2025").
 */
export function etiquetaDia(iso: string, ahora: Date): string {
  if (iso === DIA_SIN_FECHA) return ETIQUETA_SIN_FECHA;
  if (iso === isoOffset(ahora, 0)) return 'Hoy';
  if (iso === isoOffset(ahora, -1)) return 'Ayer';
  const [y, m, d] = iso.split('-').map(Number);
  const base = `${nombreDia(diaSemanaDeIso(iso))} ${d ?? 1} de ${MESES[(m ?? 1) - 1] ?? ''}`;
  const anioAhora = Number(isoOffset(ahora, 0).slice(0, 4));
  return y === anioAhora ? base : `${base} de ${y}`;
}

export type GrupoDia = {
  /** 'YYYY-MM-DD', o '' para el grupo sin fecha. */
  dia: string;
  etiqueta: string;
  esHoy: boolean;
  bloques: Bloque[];
};

/**
 * Agrupa los bloques por día calendario de Buenos Aires, del día MÁS RECIENTE al
 * más viejo. Los bloques sin `createdAt` usable quedan en un grupo "Sin fecha"
 * al final. Dentro de cada día se ordenan por `orden` (como en el editor).
 */
export function agruparPorDia(bloques: Bloque[], ahora: Date): GrupoDia[] {
  const mapa = new Map<string, Bloque[]>();
  for (const b of bloques) {
    const dia = diaDeBloque(b);
    const lista = mapa.get(dia);
    if (lista) lista.push(b);
    else mapa.set(dia, [b]);
  }

  const hoy = isoOffset(ahora, 0);
  const dias = [...mapa.keys()]
    .filter((d) => d !== DIA_SIN_FECHA)
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  if (mapa.has(DIA_SIN_FECHA)) dias.push(DIA_SIN_FECHA);

  return dias.map((dia) => ({
    dia,
    etiqueta: etiquetaDia(dia, ahora),
    esHoy: dia === hoy,
    bloques: [...(mapa.get(dia) ?? [])].sort((a, b) => a.orden - b.orden),
  }));
}

/** Quita tildes y pasa a minúscula, para buscar sin acentos ni mayúsculas. */
export function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** True si el bloque matchea la consulta (en su texto o su url). */
export function coincide(bloque: Bloque, consulta: string): boolean {
  const q = normalizar(consulta.trim());
  if (!q) return true;
  return normalizar(bloque.texto).includes(q) || normalizar(bloque.url).includes(q);
}
