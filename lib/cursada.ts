// Lógica de dominio de Mi Cursada — funciones puras, sin I/O.
// Todo cálculo calendario se hace en hora de pared de Buenos Aires vía date-fns-tz;
// nunca se usa la timezone del proceso. `ahora` siempre llega por parámetro.

import { formatDistanceStrict } from 'date-fns';
import { es } from 'date-fns/locale';
import { toZonedTime } from 'date-fns-tz';
import type { Aviso, Horario, Materia } from '@/lib/types';

export const TZ = 'America/Argentina/Buenos_Aires';

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'] as const;
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

/** Fecha "de pared" en Buenos Aires: los getters (getDay, getHours…) devuelven la hora local BA. */
function enBA(ahora: Date): Date {
  return toZonedTime(ahora, TZ);
}

/** 'HH:MM' → minutos desde medianoche. */
function aMin(hm: string): number {
  const [h = 0, m = 0] = hm.split(':').map(Number);
  return h * 60 + m;
}

const dosDig = (n: number) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' de una fecha de pared. */
function isoDe(d: Date): string {
  return `${d.getFullYear()}-${dosDig(d.getMonth() + 1)}-${dosDig(d.getDate())}`;
}

/** 'dd/MM' de una fecha de pared. */
function ddMM(d: Date): string {
  return `${dosDig(d.getDate())}/${dosDig(d.getMonth() + 1)}`;
}

/** Nombre del día en español (0=Domingo … 6=Sábado). */
export function nombreDia(dia: number): string {
  return DIAS[dia] ?? '';
}

/** Todas las clases de un día dado, ordenadas por inicio. */
function clasesDeDia(materias: Materia[], dia: number): { materia: Materia; horario: Horario }[] {
  const out: { materia: Materia; horario: Horario }[] = [];
  for (const materia of materias) {
    for (const horario of materia.horarios) {
      if (horario.dia === dia) out.push({ materia, horario });
    }
  }
  out.sort((a, b) => aMin(a.horario.inicio) - aMin(b.horario.inicio));
  return out;
}

export type ProximaClase = {
  materia: Materia;
  horario: Horario;
  /** 0 = hoy, 1 = mañana, … */
  offsetDias: number;
  enCurso: boolean;
};

/**
 * Próxima clase escaneando desde hoy hasta 7 días adelante (saltea domingo).
 * Hoy ignora clases ya terminadas; una en curso (inicio <= ahora < fin) cuenta con enCurso=true.
 */
export function proximaClase(materias: Materia[], ahora: Date): ProximaClase | null {
  const local = enBA(ahora);
  const nowMin = local.getHours() * 60 + local.getMinutes();
  const hoyDia = local.getDay();
  for (let off = 0; off <= 7; off++) {
    const dia = (hoyDia + off) % 7;
    if (dia === 0) continue; // domingo no se cursa
    for (const { materia, horario } of clasesDeDia(materias, dia)) {
      if (off === 0 && aMin(horario.fin) <= nowMin) continue; // ya terminó hoy
      return {
        materia,
        horario,
        offsetDias: off,
        enCurso: off === 0 && aMin(horario.inicio) <= nowMin,
      };
    }
  }
  return null;
}

/** "1 h 20 min" / "2 h" / "45 min". */
function duracionTexto(min: number): string {
  const h = Math.floor(min / 60);
  const r = min % 60;
  if (h > 0 && r > 0) return `${h} h ${r} min`;
  if (h > 0) return `${h} h`;
  return `${r} min`;
}

/** Línea de estado del hero de próxima clase. */
export function textoEstado(prox: ProximaClase, ahora: Date): string {
  const local = enBA(ahora);
  if (prox.offsetDias === 0) {
    if (prox.enCurso) return `En curso — termina ${prox.horario.fin}`;
    const nowMin = local.getHours() * 60 + local.getMinutes();
    return `Empieza en ${duracionTexto(aMin(prox.horario.inicio) - nowMin)}`;
  }
  if (prox.offsetDias === 1) return `Mañana a las ${prox.horario.inicio}`;
  const dia = (local.getDay() + prox.offsetDias) % 7;
  return `El ${nombreDia(dia).toLowerCase()} a las ${prox.horario.inicio}`;
}

export type ClaseHoy = {
  materia: Materia;
  horario: Horario;
  /** fin <= ahora */
  pasada: boolean;
  /** inicio <= ahora < fin */
  enCurso: boolean;
};

/** Clases del día actual (BA) ordenadas por inicio, con flags de estado. Domingo: []. */
export function clasesDeHoy(materias: Materia[], ahora: Date): ClaseHoy[] {
  const local = enBA(ahora);
  const hoyDia = local.getDay();
  if (hoyDia < 1 || hoyDia > 6) return [];
  const nowMin = local.getHours() * 60 + local.getMinutes();
  return clasesDeDia(materias, hoyDia).map(({ materia, horario }) => ({
    materia,
    horario,
    pasada: aMin(horario.fin) <= nowMin,
    enCurso: aMin(horario.inicio) <= nowMin && nowMin < aMin(horario.fin),
  }));
}

/** Minutos antes del inicio en que se abre la ventana para dar el presente. */
export const MIN_ANTES_ASISTENCIA = 10;

export type FaseAsistencia = 'antes' | 'activa' | 'terminada';

export type EstadoAsistencia = {
  fase: FaseAsistencia;
  /** True entre 10 min antes del inicio y el fin de la clase. */
  activa: boolean;
  /** Línea mono chica: "Ahora" / "En 8 min" / "Empieza 19:00" / "Terminó 23:00". */
  texto: string;
};

/**
 * Estado del recordatorio de asistencia de UNA clase de hoy, en hora de pared
 * de Buenos Aires. PURA: `ahora` llega por parámetro.
 *
 * - activa: desde MIN_ANTES_ASISTENCIA minutos antes del inicio hasta el fin.
 *   Texto "Ahora" si ya empezó, "En N min" si todavía falta.
 * - antes: "Empieza HH:MM".
 * - terminada (fin <= ahora): "Terminó HH:MM".
 */
export function estadoAsistencia(horario: Horario, ahora: Date): EstadoAsistencia {
  const local = enBA(ahora);
  const nowMin = local.getHours() * 60 + local.getMinutes();
  const inicio = aMin(horario.inicio);
  const fin = aMin(horario.fin);

  if (nowMin >= fin) {
    return { fase: 'terminada', activa: false, texto: `Terminó ${horario.fin}` };
  }
  if (nowMin >= inicio - MIN_ANTES_ASISTENCIA) {
    const faltan = inicio - nowMin;
    return {
      fase: 'activa',
      activa: true,
      texto: faltan <= 0 ? 'Ahora' : `En ${faltan} min`,
    };
  }
  return { fase: 'antes', activa: false, texto: `Empieza ${horario.inicio}` };
}

export type StatsBento = {
  clasesHoy: number;
  subClases: string;
  pendientes: number;
  vencidos: number;
  subPendientes: string;
};

/** Números y subtítulos del bento de la pantalla Hoy. */
export function statsBento(materias: Materia[], avisos: Aviso[], ahora: Date): StatsBento {
  const hoy = clasesDeHoy(materias, ahora);
  const quedan = hoy.filter((c) => !c.pasada).length;
  const empezoAlguna = hoy.some((c) => c.pasada || c.enCurso);

  let subClases: string;
  if (hoy.length === 0) subClases = 'día libre';
  else if (!empezoAlguna) subClases = 'todas por delante';
  else if (quedan > 0) subClases = quedan === 1 ? 'queda 1' : `quedan ${quedan}`;
  else subClases = 'ya terminaste';

  const hoyIso = isoDe(enBA(ahora));
  const pendientesArr = avisos.filter((a) => !a.hecho);
  const vencidos = pendientesArr.filter((a) => a.fecha < hoyIso).length;

  let subPendientes: string;
  if (pendientesArr.length === 0) subPendientes = 'al día';
  else if (vencidos > 0) subPendientes = vencidos === 1 ? '1 vencido' : `${vencidos} vencidos`;
  else subPendientes = 'nada vencido';

  return {
    clasesHoy: hoy.length,
    subClases,
    pendientes: pendientesArr.length,
    vencidos,
    subPendientes,
  };
}

export type DiaSemana = {
  /** 1=Lunes … 6=Sábado. */
  dia: number;
  nombre: string;
  /** 'dd/MM' */
  fecha: string;
  esHoy: boolean;
};

export type Semana = {
  dias: DiaSemana[];
  /** 'dd/MM – dd/MM' (lunes a sábado). */
  rango: string;
};

/**
 * Los 6 días Lunes–Sábado de la semana actual (BA), con fecha real y flag esHoy.
 * Si hoy es domingo, devuelve la semana que arranca mañana (sin ningún esHoy).
 */
export function semana(ahora: Date): Semana {
  const local = enBA(ahora);
  const hoyDia = local.getDay();
  const offLunes = hoyDia === 0 ? -1 : hoyDia - 1;
  const lunes = new Date(local);
  lunes.setDate(local.getDate() - offLunes);
  const dias: DiaSemana[] = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(lunes);
    d.setDate(lunes.getDate() + i);
    const nd = i + 1;
    dias.push({ dia: nd, nombre: nombreDia(nd), fecha: ddMM(d), esHoy: nd === hoyDia });
  }
  const primero = dias[0];
  const ultimo = dias[dias.length - 1];
  return { dias, rango: `${primero?.fecha ?? ''} – ${ultimo?.fecha ?? ''}` };
}

export type EstadoAviso = 'hecho' | 'vencido' | 'hoy' | 'pendiente';

/**
 * Estado de un aviso comparando por FECHA CALENDARIO en Buenos Aires
 * (un aviso de hoy a las 23:59 no está vencido).
 */
export function estadoAviso(aviso: Aviso, ahora: Date): EstadoAviso {
  if (aviso.hecho) return 'hecho';
  const hoyIso = isoDe(enBA(ahora));
  if (aviso.fecha < hoyIso) return 'vencido';
  if (aviso.fecha === hoyIso) return 'hoy';
  return 'pendiente';
}

/** 'YYYY-MM-DD' de hoy en Buenos Aires (default de los date inputs). */
export function hoyISO(ahora: Date): string {
  return isoDe(enBA(ahora));
}

/** Hasta 2 iniciales en mayúscula ("Facundo Costas" → "FC"). */
export function iniciales(nombre: string): string {
  return nombre
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');
}

/**
 * "hace 2 min" / "hace 3 h" / "hace 5 d". Distancia absoluta (no relativa al
 * reloj del proceso): `ahora` llega por parámetro, como el resto del módulo.
 */
export function hace(iso: string, ahora: Date): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `hace ${formatDistanceStrict(d, ahora, { locale: es })}`
    .replace(/ horas?/, ' h')
    .replace(/ minutos?/, ' min')
    .replace(/ segundos?/, ' s')
    .replace(/ días?/, ' d');
}

/** "Jueves 13 de agosto" para el H1 de Hoy (fecha de pared BA). */
export function fechaLargaHoy(ahora: Date): string {
  const local = enBA(ahora);
  return `${nombreDia(local.getDay())} ${local.getDate()} de ${MESES[local.getMonth()] ?? ''}`;
}
