// Lecturas para Server Components.
//
// Única fuente de datos: el aula virtual (Moodle). Lo que trae su API vive en
// el snapshot `datos/aula-virtual.json`, que el sync regenera; lo que la API no
// expone (horarios, profe/aula/color, notas, avisos propios, perfil) vive en
// overlays JSON aparte. `lib/datos-locales.ts` mergea las dos cosas y cachea el
// resultado en memoria, invalidando por mtime — así una página no re-parsea el
// snapshot en cada request.
//
// Este módulo es la puerta de lectura: las páginas importan de acá y no de
// datos-locales, para que el día que la persistencia cambie no haya que tocar
// ninguna pantalla.

import { getDatosLocales, leerPerfilLocal } from '@/lib/datos-locales';
import type { Aviso, Materia, Perfil } from '@/lib/types';

export type UltimaSync = {
  id: string;
  /** ISO timestamptz. */
  corridaAt: string;
  resultado: string;
  detalle: string;
};

/** Materias con horarios, bloques (por orden) y archivos anidados. */
export async function getMaterias(): Promise<Materia[]> {
  return (await getDatosLocales()).materias;
}

/** Una materia con todo anidado, o null si no existe. */
export async function getMateria(id: string): Promise<Materia | null> {
  const { materias } = await getDatosLocales();
  // El id trae ':' ("curso:2756"): es válido en un segmento de URL, pero si el
  // navegador (o un Link) lo mandó percent-encoded, lo aceptamos igual.
  const decodificado = (() => {
    try {
      return decodeURIComponent(id);
    } catch {
      return id;
    }
  })();
  return materias.find((m) => m.id === id || m.id === decodificado) ?? null;
}

/** Todos los avisos, ordenados por fecha ascendente. */
export async function getAvisos(): Promise<Aviso[]> {
  return (await getDatosLocales()).avisos;
}

/** Perfil del usuario o null si todavía no lo creó. */
export async function getPerfil(): Promise<Perfil | null> {
  return leerPerfilLocal();
}

/** Cuándo se generó el snapshot actual, o null si nunca se sincronizó. */
export async function getUltimaSync(): Promise<UltimaSync | null> {
  const { generado, materias, avisos } = await getDatosLocales();
  if (!generado) return null;
  const archivos = materias.reduce((n, m) => n + m.archivos.length, 0);
  return {
    id: 'local',
    corridaAt: generado,
    resultado: 'ok',
    detalle: `${materias.length} materias · ${archivos} archivos · ${avisos.length} avisos`,
  };
}
