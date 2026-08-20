// Fase 3 — Lecturas para Server Components.
// Arma los tipos de dominio (camelCase) a partir de las tablas compartidas
// (ver lib/armar-materias.ts) o cae al snapshot local si Supabase no está
// configurado.

import { armarAvisos, armarMaterias } from '@/lib/armar-materias';
import type {
  ArchivoManualRow,
  AvisoCursoRow,
  AvisoEstadoRow,
  AvisoManualRow,
  BloqueRow,
  CursoRow,
  ExtraRow,
  HorarioRow,
} from '@/lib/armar-materias';
import { getDatosLocales, leerPerfilLocal } from '@/lib/datos-locales';
import { adminClient, adminConfigurado } from '@/lib/supabase/admin';
import { supabaseConfigurado } from '@/lib/supabase/configurado';
import { createClient } from '@/lib/supabase/server';
import type { Aviso, Materia, Perfil } from '@/lib/types';

export type UltimaSync = {
  id: string;
  /** ISO timestamptz. */
  corridaAt: string;
  resultado: string;
  detalle: string;
};

// --- Queries ---

let avisoSinConfigurar = false;

/**
 * True si Supabase está configurado. Si no, avisa una vez por proceso y las
 * queries caen al snapshot local (datos/aula-virtual.json, ver lib/datos-locales.ts).
 */
function conSupabase(): boolean {
  if (supabaseConfigurado()) return true;
  if (!avisoSinConfigurar) {
    avisoSinConfigurar = true;
    console.warn('Supabase sin configurar — leyendo el snapshot local del aula virtual');
  }
  return false;
}

/** El id de curso trae ':' ("curso:2756") — válido en un segmento de URL, pero
 * si el navegador (o un Link) lo mandó percent-encoded, lo aceptamos igual. */
function decodificarId(id: string): string {
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
}

/** Materias del usuario con horarios, bloques (por orden) y archivos anidados. */
export async function getMaterias(): Promise<Materia[]> {
  if (!conSupabase()) return (await getDatosLocales()).materias;
  const supabase = await createClient();
  const [cursos, extras, horarios, bloques, archivos] = await Promise.all([
    supabase.from('inscripciones').select('curso:cursos ( id, nombre, datos )'),
    supabase.from('materias_extra').select('curso_id, profe, aula, color'),
    supabase.from('horarios').select('id, curso_id, dia, inicio, fin'),
    supabase.from('bloques').select('id, curso_id, tipo, texto, url, estado, hecho, orden, created_at, fmt, ref'),
    supabase.from('archivos_manuales').select('id, curso_id, nombre, url'),
  ]);
  const conError = [cursos, extras, horarios, bloques, archivos].find((r) => r.error);
  if (conError?.error) {
    console.error('getMaterias:', conError.error);
    throw conError.error;
  }
  const filasCursos = (cursos.data ?? [])
    .map((i) => (i as unknown as { curso: CursoRow | null }).curso)
    .filter((c): c is CursoRow => c !== null);
  return armarMaterias(
    filasCursos,
    (extras.data ?? []) as ExtraRow[],
    (horarios.data ?? []) as HorarioRow[],
    (bloques.data ?? []) as BloqueRow[],
    (archivos.data ?? []) as ArchivoManualRow[]
  );
}

/** Una materia con todo anidado, o null si no existe. */
export async function getMateria(id: string): Promise<Materia | null> {
  const decodificado = decodificarId(id);
  if (!conSupabase()) {
    const { materias } = await getDatosLocales();
    return materias.find((m) => m.id === id || m.id === decodificado) ?? null;
  }
  const supabase = await createClient();
  const [cursos, extras, horarios, bloques, archivos] = await Promise.all([
    supabase
      .from('inscripciones')
      .select('curso:cursos ( id, nombre, datos )')
      .eq('curso_id', decodificado),
    supabase.from('materias_extra').select('curso_id, profe, aula, color').eq('curso_id', decodificado),
    supabase.from('horarios').select('id, curso_id, dia, inicio, fin').eq('curso_id', decodificado),
    supabase
      .from('bloques')
      .select('id, curso_id, tipo, texto, url, estado, hecho, orden, created_at, fmt, ref')
      .eq('curso_id', decodificado),
    supabase.from('archivos_manuales').select('id, curso_id, nombre, url').eq('curso_id', decodificado),
  ]);
  const conError = [cursos, extras, horarios, bloques, archivos].find((r) => r.error);
  if (conError?.error) {
    console.error('getMateria:', conError.error);
    throw conError.error;
  }
  const filasCursos = (cursos.data ?? [])
    .map((i) => (i as unknown as { curso: CursoRow | null }).curso)
    .filter((c): c is CursoRow => c !== null);
  const materias = armarMaterias(
    filasCursos,
    (extras.data ?? []) as ExtraRow[],
    (horarios.data ?? []) as HorarioRow[],
    (bloques.data ?? []) as BloqueRow[],
    (archivos.data ?? []) as ArchivoManualRow[]
  );
  return materias[0] ?? null;
}

/** Todos los avisos del usuario, ordenados por fecha ascendente. */
export async function getAvisos(): Promise<Aviso[]> {
  if (!conSupabase()) return (await getDatosLocales()).avisos;
  const supabase = await createClient();
  const [deCurso, estados, manuales] = await Promise.all([
    supabase.from('avisos_curso').select('id, curso_id, titulo, fecha'),
    supabase.from('avisos_estado').select('aviso_id, hecho'),
    supabase.from('avisos_manuales').select('id, curso_id, titulo, fecha, hecho, nota_id'),
  ]);
  const conError = [deCurso, estados, manuales].find((r) => r.error);
  if (conError?.error) {
    console.error('getAvisos:', conError.error);
    throw conError.error;
  }
  return armarAvisos(
    (deCurso.data ?? []) as AvisoCursoRow[],
    (estados.data ?? []) as AvisoEstadoRow[],
    (manuales.data ?? []) as AvisoManualRow[]
  );
}

/** Perfil del usuario o null si todavía no lo creó. */
export async function getPerfil(): Promise<Perfil | null> {
  // Sin Supabase el perfil vive en datos/perfil.json (y la foto en datos/avatar.<ext>).
  if (!conSupabase()) return leerPerfilLocal();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('perfiles')
    .select('nombre, carrera, instituto, sede, avatar_url, consentimiento_en, onboarding_en')
    .maybeSingle();

  if (error) {
    // Los campos del PostgrestError se listan a mano: pasado como objeto se
    // serializa a `{}` cruzando el borde RSC y el overlay de Next mostraba
    // "getPerfil: {}", que no dice nada. El caso típico acá es una columna del
    // select que la base todavía no tiene (falta correr una migración).
    console.error(
      `getPerfil: ${error.code ?? 'sin código'} — ${error.message}${
        error.hint ? ` (hint: ${error.hint})` : ''
      }`
    );
    throw error;
  }
  if (!data) return null;
  const row = data as {
    nombre: string;
    carrera: string | null;
    instituto: string | null;
    sede: string | null;
    avatar_url: string | null;
    consentimiento_en: string | null;
    onboarding_en: string | null;
  };
  return {
    nombre: row.nombre,
    carrera: row.carrera,
    instituto: row.instituto,
    sede: row.sede,
    avatarUrl: row.avatar_url,
    consentimientoEn: row.consentimiento_en,
    onboardingEn: row.onboarding_en,
  };
}

/** Última corrida del scraper o null si nunca corrió. */
export async function getUltimaSync(): Promise<UltimaSync | null> {
  if (!adminConfigurado()) {
    // Sin base, la "última sync" es el momento en que se generó el snapshot.
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
  const supabase = adminClient();
  const { data, error } = await supabase
    .from('sync_log')
    .select('id, corrida_at, resultado, detalle')
    .order('corrida_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('getUltimaSync:', error);
    throw error;
  }
  if (!data) return null;
  const row = data as { id: string; corrida_at: string; resultado: string; detalle: string };
  return {
    id: row.id,
    corridaAt: row.corrida_at,
    resultado: row.resultado,
    detalle: row.detalle,
  };
}
