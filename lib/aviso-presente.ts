// Aviso de "dar el presente" 10 minutos antes de cada clase: lógica pura + el
// contrato del evento de window. El componente vive en `components/aviso-presente.tsx`
// (mismo patrón que `lib/toast.ts` y `lib/logro.ts`: acá el contrato, allá el DOM).
//
// La ventana de 10 minutos NO se define acá: es `MIN_ANTES_ASISTENCIA` de
// `lib/cursada.ts`, la misma que ya pinta "Dar el presente" en ámbar. Un solo
// número para el badge y para el aviso.

import { clasesDeHoy, estadoAsistencia, hoyISO } from '@/lib/cursada';
import type { Horario, Materia } from '@/lib/types';

/** Preferencia por dispositivo: 'on' | 'off'. Ausente = apagado. */
export const CLAVE_ACTIVO = 'cursada:aviso-presente';

/** Claves de las clases ya avisadas, para que un F5 no vuelva a sonar. */
export const CLAVE_AVISADAS = 'cursada:presentes-avisados';

/** Lo despacha la campanita; lo escucha el notificador del layout. */
export const EVENTO_AVISO = 'cursada:aviso-presente';

/**
 * La materia como la necesita el aviso: el layout de `(app)` monta el
 * notificador en TODAS las páginas, así que no tiene sentido serializarle
 * `bloques`, `archivos` y `secciones` de cada materia a cada request.
 */
export type MateriaAvisable = {
  id: string;
  nombre: string;
  horarios: Horario[];
};

/**
 * Sin `asistenciaUrl` no hay presente que dar, y sin horarios no sabemos
 * cuándo avisar: las dos se filtran acá y no en el componente.
 */
export function materiasAvisables(materias: Materia[]): MateriaAvisable[] {
  return materias
    .filter((m) => m.asistenciaUrl && m.horarios.length > 0)
    .map((m) => ({ id: m.id, nombre: m.nombre, horarios: m.horarios }));
}

/**
 * Clave de dedup: lleva la FECHA además del horario, así la misma clase vuelve
 * a avisar la semana que viene (y no avisa dos veces el mismo día).
 */
export function claveAviso(hoyIso: string, horarioId: string): string {
  return `${hoyIso}:${horarioId}`;
}

/** True si la clave es de hoy: sirve para purgar las de días pasados. */
export function esDeHoy(clave: string, hoyIso: string): boolean {
  return clave.startsWith(`${hoyIso}:`);
}

export type AvisoClase = {
  clave: string;
  materiaId: string;
  nombre: string;
  /** 'HH:MM' del inicio de la clase. */
  inicio: string;
  /** Minutos que faltan para el inicio (> 0 siempre: nunca avisa algo empezado). */
  faltan: number;
};

/**
 * Clases de hoy que hay que avisar AHORA. PURA: `ahora` y las claves ya
 * avisadas llegan por parámetro.
 *
 * Se avisa cuando la clase entró en la ventana activa (`estadoAsistencia`) y
 * TODAVÍA NO EMPEZÓ (`faltan >= 0`). Una clase en curso no suena a propósito:
 * si abrís la app a mitad de la clase ya sabés que estás en clase, y un chime
 * ahí es puro ruido.
 */
export function avisosPendientes(
  materias: MateriaAvisable[],
  ahora: Date,
  avisadas: Set<string>
): AvisoClase[] {
  const hoyIso = hoyISO(ahora);
  const out: AvisoClase[] = [];

  for (const { materia, horario } of clasesDeHoy(materias, ahora)) {
    const estado = estadoAsistencia(horario, ahora);
    if (estado.fase !== 'activa') continue;
    if (estado.faltan <= 0) continue; // ya empezó: el chime sería puro ruido

    const clave = claveAviso(hoyIso, horario.id);
    if (avisadas.has(clave)) continue;

    out.push({
      clave,
      materiaId: materia.id,
      nombre: materia.nombre,
      inicio: horario.inicio,
      faltan: estado.faltan,
    });
  }

  return out;
}
