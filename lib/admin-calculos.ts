// Cálculos puros del panel admin (specs/panel-admin) — sin IO, testeables.
//
// La entrada es lo que `lib/admin-metricas.ts` junta de la base (counts,
// fechas, tipos: NUNCA contenido de notas) y la salida es exactamente lo que
// el panel pinta. Todo lo que dependa de "ahora" lo recibe por parámetro:
// nada de `new Date()` acá adentro.

import { formatInTimeZone } from 'date-fns-tz';
import { TZ, hace } from '@/lib/cursada';

/** Fecha calendario (YYYY-MM-DD) de un instante, en hora de Buenos Aires. */
export function fechaBA(iso: string): string {
  return formatInTimeZone(new Date(iso), TZ, 'yyyy-MM-dd');
}

/** Umbrales de estado (minutos/horas desde `ultima_visita`). */
export const MIN_ONLINE = 30;
export const HORAS_INACTIVO = 24;

export type EstadoUsuario = 'online' | 'inactivo' | 'offline';

/** Colores semánticos del handoff (README §Panel Admin). */
export const COLOR_ESTADO: Record<EstadoUsuario, string> = {
  online: '#34d399',
  inactivo: '#fbbf24',
  offline: '#64748b',
};

const VERDE = '#34d399';
const ROJO = '#fb7185';
const CELESTE = '#38bdf8';
const VIOLETA = '#a78bfa';
const AMBAR = 'var(--acc)';

/** Paleta de avatares del prototipo; se elige por hash del id (determinístico). */
const AVATARES = ['#38bdf8', '#a78bfa', '#34d399', '#fb7185', '#f97316', '#e2e8f0'];

export function colorAvatar(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATARES[h % AVATARES.length] ?? AVATARES[0]!;
}

export function estadoUsuario(ultimaVisitaIso: string, ahora: Date): EstadoUsuario {
  const min = (ahora.getTime() - new Date(ultimaVisitaIso).getTime()) / 60_000;
  if (min < MIN_ONLINE) return 'online';
  if (min < HORAS_INACTIVO * 60) return 'inactivo';
  return 'offline';
}

/**
 * XP acumulada por los hitos del logro (lib/logro.ts): 50 por la primera nota,
 * 100 al llegar a 5, 150 a 10, y 250 por cada múltiplo de 25 alcanzado.
 */
export function xpTotal(totalNotas: number): number {
  if (totalNotas < 1) return 0;
  let xp = 50;
  if (totalNotas >= 5) xp += 100;
  if (totalNotas >= 10) xp += 150;
  xp += 250 * Math.floor(totalNotas / 25);
  return xp;
}

/** "42 min" / "1 h 05" para la columna Sesión. */
export function duracionSesion(inicioIso: string, ahora: Date): string {
  const min = Math.max(0, Math.floor((ahora.getTime() - new Date(inicioIso).getTime()) / 60_000));
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
}

export type EventoCrudo = { ts: string; evento: string; datos: Record<string, unknown> };
export type EventoPanel = { col: string; txt: string; hace: string };

/** Texto y color semántico de un evento del log. Metadata, jamás contenido. */
export function textoEvento(e: EventoCrudo): { col: string; txt: string } {
  switch (e.evento) {
    case 'sesion_iniciada':
      return { col: CELESTE, txt: 'Entró a la app' };
    case 'sync_ok': {
      const n = typeof e.datos.cursos === 'number' ? e.datos.cursos : null;
      return { col: VERDE, txt: n ? `Sincronizó el aula virtual (${n} cursos)` : 'Sincronizó el aula virtual' };
    }
    case 'sync_error':
      return { col: ROJO, txt: 'Falló la sincronización del aula virtual' };
    case 'nota_creada': {
      const curso = typeof e.datos.curso === 'string' && e.datos.curso ? e.datos.curso : null;
      return { col: AMBAR, txt: curso ? `Creó una nota en ${curso}` : 'Creó una nota' };
    }
    case 'consentimiento_aceptado':
      return { col: VIOLETA, txt: 'Aceptó el consentimiento' };
    default:
      return { col: CELESTE, txt: e.evento.replaceAll('_', ' ') };
  }
}

/**
 * Texto de "Última actividad" de la fila: el último evento si la persona está
 * activa; si está offline, "Último acceso hace X".
 */
export function ultimaActividad(
  estado: EstadoUsuario,
  ultimoEvento: EventoCrudo | null,
  ultimaVisitaIso: string,
  ahora: Date
): string {
  if (estado !== 'offline' && ultimoEvento) return textoEvento(ultimoEvento).txt;
  return `Último acceso ${hace(ultimaVisitaIso, ahora)}`;
}

/** Estado de la conexión con el aula virtual, para el pie del detalle. */
export function estadoSync(
  sync: { ok: boolean; cuando: string } | null,
  ahora: Date
): string {
  if (!sync) return 'nunca conectado';
  const cuanto = hace(sync.cuando, ahora);
  return sync.ok ? `ok · ${cuanto}` : `error · ${cuanto}`;
}

// ---------------------------------------------------------------------------
// Dataset completo del panel
// ---------------------------------------------------------------------------

export type UsuarioCrudo = {
  id: string;
  nombre: string;
  carrera: string;
  /** username del aula virtual (credenciales.meta.usuario) o ''. */
  usuario: string;
  avatarUrl: string | null;
  ultimaVisita: string;
  materias: number;
  notas: number;
  notasHoy: number;
  tareasHechas: number;
  tareasTotal: number;
  archivos: number;
  avisosPend: number;
  avisosVencidos: number;
  porMateria: { nombre: string; notas: number }[];
  eventos: EventoCrudo[]; // más nuevo primero
  sync: { ok: boolean; cuando: string } | null;
  /** ts del último sesion_iniciada de hoy, si hubo. */
  sesionIniciadaHoy: string | null;
};

export type Metrica = { k: string; v: string; col: string };
export type Stat = { k: string; v: string; col: string; delta: string; dCol: string };

export type UsuarioPanel = {
  id: string;
  nombre: string;
  carrera: string;
  usuario: string;
  avatarUrl: string | null;
  avBg: string;
  estado: EstadoUsuario;
  actividad: string;
  sesion: string;
  notasHoy: number;
  metricas: Metrica[];
  materiasTop: { k: string; pct: number }[];
  eventos: EventoPanel[];
  sync: string;
};

function colorTareas(hechas: number, total: number): string {
  if (total === 0) return 'var(--tx3)';
  const p = hechas / total;
  if (p >= 0.8) return VERDE;
  if (p >= 0.4) return AMBAR;
  return ROJO;
}

export function armarUsuario(u: UsuarioCrudo, ahora: Date): UsuarioPanel {
  const estado = estadoUsuario(u.ultimaVisita, ahora);
  const totalNotasMaterias = u.porMateria.reduce((a, m) => a + m.notas, 0);
  return {
    id: u.id,
    nombre: u.nombre,
    carrera: u.carrera,
    usuario: u.usuario,
    avatarUrl: u.avatarUrl,
    avBg: colorAvatar(u.id),
    estado,
    actividad: ultimaActividad(estado, u.eventos[0] ?? null, u.ultimaVisita, ahora),
    sesion:
      estado === 'online' && u.sesionIniciadaHoy ? duracionSesion(u.sesionIniciadaHoy, ahora) : '—',
    notasHoy: u.notasHoy,
    metricas: [
      { k: 'materias', v: String(u.materias), col: 'var(--tx)' },
      { k: 'notas', v: String(u.notas), col: 'var(--tx)' },
      {
        k: 'to-dos',
        v: `${u.tareasHechas}/${u.tareasTotal}`,
        col: colorTareas(u.tareasHechas, u.tareasTotal),
      },
      { k: 'archivos', v: String(u.archivos), col: 'var(--tx)' },
      {
        k: 'avisos pend.',
        v: String(u.avisosPend),
        col: u.avisosPend > 0 ? AMBAR : 'var(--tx3)',
      },
      { k: 'xp', v: String(xpTotal(u.notas)), col: VERDE },
    ],
    materiasTop: [...u.porMateria]
      .sort((a, b) => b.notas - a.notas)
      .slice(0, 5)
      .map((m) => ({
        k: m.nombre,
        pct: totalNotasMaterias > 0 ? Math.round((m.notas / totalNotasMaterias) * 100) : 0,
      })),
    eventos: u.eventos.slice(0, 8).map((e) => ({ ...textoEvento(e), hace: hace(e.ts, ahora) })),
    sync: estadoSync(u.sync, ahora),
  };
}

export function armarStats(usuarios: UsuarioCrudo[], ahora: Date): Stat[] {
  const estados = usuarios.map((u) => estadoUsuario(u.ultimaVisita, ahora));
  const online = estados.filter((e) => e === 'online').length;
  const semana = usuarios.filter(
    (u) => ahora.getTime() - new Date(u.ultimaVisita).getTime() < 7 * 24 * 60 * 60 * 1000
  ).length;
  const notasHoy = usuarios.reduce((a, u) => a + u.notasHoy, 0);
  const syncsOk = usuarios.filter((u) => u.sync?.ok).length;
  const syncsError = usuarios.filter((u) => u.sync && !u.sync.ok).length;
  const nunca = usuarios.filter((u) => !u.sync).length;
  const vencidos = usuarios.reduce((a, u) => a + u.avisosVencidos, 0);
  const conVencidos = usuarios.filter((u) => u.avisosVencidos > 0).length;

  const partesSync: string[] = [];
  if (syncsError > 0) partesSync.push(`${syncsError} error`);
  if (nunca > 0) partesSync.push(`${nunca} nunca`);

  return [
    { k: 'activas ahora', v: String(online), col: VERDE, delta: '', dCol: 'var(--tx3)' },
    { k: 'usuarias totales', v: String(usuarios.length), col: 'var(--tx)', delta: '', dCol: 'var(--tx3)' },
    { k: 'notas creadas hoy', v: String(notasHoy), col: AMBAR, delta: '', dCol: 'var(--tx3)' },
    { k: 'activas esta semana', v: String(semana), col: 'var(--tx)', delta: '', dCol: 'var(--tx3)' },
    {
      k: 'syncs ok',
      v: `${syncsOk}/${usuarios.length}`,
      col: syncsOk === usuarios.length ? VERDE : AMBAR,
      delta: partesSync.join(' · '),
      dCol: ROJO,
    },
    {
      k: 'avisos vencidos',
      v: String(vencidos),
      col: vencidos > 0 ? ROJO : 'var(--tx)',
      delta: conVencidos > 0 ? `en ${conVencidos} ${conVencidos === 1 ? 'usuario' : 'usuarios'}` : '',
      dCol: 'var(--tx3)',
    },
  ];
}
