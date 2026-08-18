// Sincronización COMPARTIDA — SOLO SERVIDOR, siempre via service role (los
// usuarios no tienen policies de escritura sobre cursos/avisos_curso).
//
// La idea que abarata todo: si cinco personas cursan Fundamentos, el contenido
// se baja UNA vez. Quien sincroniza refresca los cursos para todos; los demás
// reusan. La ventana de frescura la chequea el que llama (montarCursada/cron):
// el botón "Sincronizar ahora" fuerza siempre.

import { registrarEvento } from '@/lib/eventos';
import type { Credencial } from '@/lib/moodle/credenciales';
import { armarSnapshot, construirPlan } from '@/lib/moodle/plan';
import { adminClient } from '@/lib/supabase/admin';

export const HORAS_FRESCO_COMPARTIDO = 6;

/** ¿Todos los cursos del usuario están sincronizados hace menos de `horas`? */
export async function cursadaFresca(
  userId: string,
  horas = HORAS_FRESCO_COMPARTIDO
): Promise<boolean> {
  const admin = adminClient();
  const { data, error } = await admin
    .from('inscripciones')
    .select('curso:cursos ( sincronizado )')
    .eq('user_id', userId);
  if (error) throw error;
  const marcas = (data ?? [])
    .map((i) => (i as unknown as { curso: { sincronizado: string } | null }).curso?.sincronizado)
    .filter((s): s is string => Boolean(s));
  if (marcas.length === 0) return false; // sin cursos todavía: hay que sincronizar
  const limite = Date.now() - horas * 60 * 60 * 1000;
  return marcas.every((s) => new Date(s).getTime() > limite);
}

export async function sincronizarCompartido(
  cred: Credencial,
  userId: string,
  origen: 'login' | 'boton' | 'cron'
): Promise<{ materias: number; archivos: number; avisos: number; generado: string; nombre: string }> {
  const plan = await construirPlan(cred);
  const snapshot = armarSnapshot(plan);
  const admin = adminClient();
  const ahora = snapshot.generado ?? new Date().toISOString();

  // Cursos: el contenido completo de cada materia, sin overlays personales.
  const filasCursos = snapshot.materias.map((m) => ({
    id: m.id,
    nombre: m.nombre,
    datos: m,
    sincronizado: ahora,
  }));
  if (filasCursos.length > 0) {
    const { error } = await admin.from('cursos').upsert(filasCursos);
    if (error) throw error;
  }

  // Refs de archivos para el proxy.
  const filasRefs = Object.entries(plan.refsArchivos).map(([ref, datos]) => ({
    ref,
    datos,
    actualizado: ahora,
  }));
  if (filasRefs.length > 0) {
    const { error } = await admin.from('archivo_refs').upsert(filasRefs);
    if (error) throw error;
  }

  // Avisos del aula (ids estables tipo "assign:14782").
  const filasAvisos = snapshot.avisos.map((a) => ({
    id: a.id,
    curso_id: a.materiaId ?? null,
    titulo: a.titulo,
    fecha: a.fecha,
  }));
  if (filasAvisos.length > 0) {
    const { error } = await admin.from('avisos_curso').upsert(filasAvisos);
    if (error) throw error;
  }

  // Inscripciones del que sincronizó: su set actual de cursos, ni más ni menos.
  const ids = snapshot.materias.map((m) => m.id);
  if (ids.length > 0) {
    const { error: eIns } = await admin
      .from('inscripciones')
      .upsert(ids.map((curso_id) => ({ user_id: userId, curso_id })));
    if (eIns) throw eIns;
  }
  // Borrado de inscripciones obsoletas: el `.not(... 'in', '()')` queda
  // malformado si `ids` está vacío (Postgres lo lee como una lista con un
  // string vacío adentro, no como "ninguno"), así que ese caso se resuelve
  // aparte con un delete sin filtro de curso.
  if (ids.length === 0) {
    const { error } = await admin.from('inscripciones').delete().eq('user_id', userId);
    if (error) throw error;
  } else {
    const { error } = await admin
      .from('inscripciones')
      .delete()
      .eq('user_id', userId)
      .not('curso_id', 'in', `(${ids.map((i) => `"${i}"`).join(',')})`);
    if (error) throw error;
  }

  const archivos = snapshot.materias.reduce((n, m) => n + m.archivos.length, 0);
  await admin.from('sync_log').insert({
    origen,
    resultado: 'ok',
    detalle: `${snapshot.materias.length} materias · ${archivos} archivos · ${snapshot.avisos.length} avisos`,
  });
  await registrarEvento('sync_ok', userId, { origen, cursos: snapshot.materias.length });

  return {
    materias: snapshot.materias.length,
    archivos,
    avisos: snapshot.avisos.length,
    generado: ahora,
    nombre: plan.site.fullname,
  };
}
