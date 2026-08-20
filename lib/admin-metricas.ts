// Datos del panel admin — SOLO SERVIDOR (usa adminClient, salta RLS a
// propósito: es el panel del administrador).
//
// REGLA ESTRUCTURAL (specs/panel-admin §2): este módulo junta counts, tipos,
// fechas y nombres de materia. NUNCA selecciona `bloques.texto`, `url`, `fmt`
// ni `ref` — no existe camino del panel al contenido de las notas de nadie.

import { armarStats, armarUsuario, fechaBA, type EventoCrudo, type Stat, type UsuarioCrudo, type UsuarioPanel } from '@/lib/admin-calculos';
import { hashUsuario } from '@/lib/cifrado';
import { hoyISO } from '@/lib/cursada';
import { adminClient } from '@/lib/supabase/admin';

export type PanelAdmin = {
  /** ISO del render, para "actualizado {hora}". */
  generado: string;
  stats: Stat[];
  usuarios: UsuarioPanel[];
};

type MetaCred = {
  usuario?: string;
  ultimaVerificacion?: { ok?: boolean; cuando?: string };
};

const MAX_EVENTOS = 500;

export async function metricasAdmin(ahora: Date): Promise<PanelAdmin> {
  const admin = adminClient();

  const [perfiles, credenciales, inscripciones, bloques, archivos, avisosCurso, avisosEstado, avisosManuales, eventos] =
    await Promise.all([
      admin.from('perfiles').select('user_id, nombre, carrera, avatar_url, ultima_visita'),
      admin.from('credenciales').select('user_id, meta'),
      admin.from('inscripciones').select('user_id, curso_id, curso:cursos ( nombre )'),
      // Sin texto/url/fmt/ref, a propósito.
      admin.from('bloques').select('user_id, curso_id, tipo, hecho, created_at'),
      admin.from('archivos_manuales').select('user_id'),
      admin.from('avisos_curso').select('id, curso_id, fecha'),
      admin.from('avisos_estado').select('user_id, aviso_id, hecho'),
      admin.from('avisos_manuales').select('user_id, fecha, hecho'),
      admin.from('eventos').select('ts, usuario_hash, evento, datos').order('ts', { ascending: false }).limit(MAX_EVENTOS),
    ]);

  const conError = [perfiles, credenciales, inscripciones, bloques, archivos, avisosCurso, avisosEstado, avisosManuales, eventos].find((r) => r.error);
  if (conError?.error) throw conError.error;

  const hoy = hoyISO(ahora);

  // Índices por usuario
  const metaPorUsuario = new Map<string, MetaCred>(
    (credenciales.data ?? []).map((c) => [c.user_id as string, (c.meta ?? {}) as MetaCred])
  );
  const cursosPorUsuario = new Map<string, { id: string; nombre: string }[]>();
  for (const i of inscripciones.data ?? []) {
    const fila = i as unknown as { user_id: string; curso_id: string; curso: { nombre: string } | null };
    const lista = cursosPorUsuario.get(fila.user_id) ?? [];
    lista.push({ id: fila.curso_id, nombre: fila.curso?.nombre ?? fila.curso_id });
    cursosPorUsuario.set(fila.user_id, lista);
  }
  const avisosPorCurso = new Map<string, { id: string; fecha: string }[]>();
  for (const a of avisosCurso.data ?? []) {
    const lista = avisosPorCurso.get(a.curso_id as string) ?? [];
    lista.push({ id: a.id as string, fecha: a.fecha as string });
    avisosPorCurso.set(a.curso_id as string, lista);
  }
  const hechosPorUsuario = new Map<string, Set<string>>();
  for (const e of avisosEstado.data ?? []) {
    if (!e.hecho) continue;
    const set = hechosPorUsuario.get(e.user_id as string) ?? new Set<string>();
    set.add(e.aviso_id as string);
    hechosPorUsuario.set(e.user_id as string, set);
  }
  // Nombre de cada curso, para que "Creó una nota en X" muestre la materia
  // (el evento guarda solo el curso_id).
  const nombrePorCurso = new Map<string, string>();
  for (const lista of cursosPorUsuario.values())
    for (const c of lista) nombrePorCurso.set(c.id, c.nombre);

  const eventosPorHash = new Map<string, EventoCrudo[]>();
  for (const e of eventos.data ?? []) {
    if (!e.usuario_hash) continue;
    const datos = { ...((e.datos ?? {}) as Record<string, unknown>) };
    if (typeof datos.curso_id === 'string' && !datos.curso)
      datos.curso = nombrePorCurso.get(datos.curso_id) ?? null;
    const lista = eventosPorHash.get(e.usuario_hash as string) ?? [];
    lista.push({ ts: e.ts as string, evento: e.evento as string, datos });
    eventosPorHash.set(e.usuario_hash as string, lista);
  }

  const crudos: UsuarioCrudo[] = (perfiles.data ?? []).map((p) => {
    const userId = p.user_id as string;
    const meta = metaPorUsuario.get(userId);
    const cursos = cursosPorUsuario.get(userId) ?? [];
    const idsCursos = new Set(cursos.map((c) => c.id));

    const bloquesDelUsuario = (bloques.data ?? []).filter((b) => b.user_id === userId);
    const notasDelUsuario = bloquesDelUsuario.filter((b) => b.tipo !== 'divisor');
    const tareas = bloquesDelUsuario.filter((b) => b.tipo === 'tarea');

    const porMateria = cursos.map((c) => ({
      nombre: c.nombre,
      notas: notasDelUsuario.filter((b) => b.curso_id === c.id).length,
    }));

    // Avisos que le aplican: los de sus cursos (menos los marcados hechos) +
    // los manuales propios sin marcar.
    const hechos = hechosPorUsuario.get(userId) ?? new Set<string>();
    const delCurso: { id: string; fecha: string }[] = [];
    for (const id of idsCursos) {
      for (const a of avisosPorCurso.get(id) ?? []) {
        if (!hechos.has(a.id)) delCurso.push(a);
      }
    }
    const manuales = (avisosManuales.data ?? []).filter((a) => a.user_id === userId && !a.hecho);
    const fechas = [...delCurso.map((a) => a.fecha), ...manuales.map((a) => a.fecha as string)];

    const evs = eventosPorHash.get(hashUsuario(userId)) ?? [];
    const sesionHoy = evs.find((e) => e.evento === 'sesion_iniciada' && fechaBA(e.ts) === hoy) ?? null;
    const verif = meta?.ultimaVerificacion;

    return {
      id: userId,
      nombre: p.nombre as string,
      carrera: p.carrera as string,
      usuario: meta?.usuario ?? '',
      avatarUrl: (p.avatar_url as string | null) ?? null,
      ultimaVisita: p.ultima_visita as string,
      materias: cursos.length,
      notas: notasDelUsuario.length,
      notasHoy: notasDelUsuario.filter((b) => fechaBA(String(b.created_at)) === hoy).length,
      tareasHechas: tareas.filter((t) => t.hecho).length,
      tareasTotal: tareas.length,
      archivos: (archivos.data ?? []).filter((a) => a.user_id === userId).length,
      avisosPend: fechas.filter((f) => f >= hoy).length,
      avisosVencidos: fechas.filter((f) => f < hoy).length,
      porMateria,
      eventos: evs,
      sync: verif?.cuando ? { ok: Boolean(verif.ok), cuando: verif.cuando } : null,
      sesionIniciadaHoy: sesionHoy?.ts ?? null,
    };
  });

  // Más reciente primero, como el prototipo (los online arriba salen solos).
  crudos.sort((a, b) => b.ultimaVisita.localeCompare(a.ultimaVisita));

  return {
    generado: ahora.toISOString(),
    stats: armarStats(crudos, ahora),
    usuarios: crudos.map((u) => armarUsuario(u, ahora)),
  };
}
