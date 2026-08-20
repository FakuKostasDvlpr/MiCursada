import { describe, it, expect } from 'vitest';
import { fromZonedTime } from 'date-fns-tz';
import type { Dia, Horario, Materia } from '@/lib/types';
import { MIN_ANTES_ASISTENCIA } from '@/lib/cursada';
import {
  avisosPendientes,
  claveAviso,
  esDeHoy,
  materiasAvisables,
  type MateriaAvisable,
} from '@/lib/aviso-presente';

const TZ = 'America/Argentina/Buenos_Aires';

/** Construye un Date UTC a partir de hora de pared de Buenos Aires. */
const ba = (s: string) => fromZonedTime(s, TZ);

let seq = 0;
const horario = (dia: Dia, inicio: string, fin: string): Horario => ({
  id: `h${++seq}`,
  materiaId: 'x',
  dia,
  inicio,
  fin,
});

const avisable = (nombre: string, horarios: Horario[]): MateriaAvisable => ({
  id: `m-${nombre}`,
  nombre,
  horarios,
});

// Semana de referencia (2026): Jue 13/08 es día 4; Dom 16/08 es día 0.
const JUEVES = '2026-08-13';
const DOMINGO = '2026-08-16';

const sinAvisar = new Set<string>();

describe('materiasAvisables', () => {
  const base = {
    profe: '',
    aula: '',
    color: '#38bdf8' as const,
    source: 'moodle' as const,
    bloques: [],
    archivos: [],
  };

  it('deja solo las que tienen asistenciaUrl y horarios', () => {
    const materias: Materia[] = [
      { ...base, id: 'a', nombre: 'Con todo', asistenciaUrl: 'u', horarios: [horario(4, '18:10', '19:40')] },
      { ...base, id: 'b', nombre: 'Sin url', horarios: [horario(4, '18:10', '19:40')] },
      { ...base, id: 'c', nombre: 'Sin horarios', asistenciaUrl: 'u', horarios: [] },
    ];
    expect(materiasAvisables(materias).map((m) => m.id)).toEqual(['a']);
  });

  it('no arrastra bloques ni archivos al cliente', () => {
    const materias: Materia[] = [
      { ...base, id: 'a', nombre: 'X', asistenciaUrl: 'u', horarios: [horario(4, '18:10', '19:40')] },
    ];
    expect(Object.keys(materiasAvisables(materias)[0]!).sort()).toEqual(['horarios', 'id', 'nombre']);
  });
});

describe('claveAviso / esDeHoy', () => {
  it('la clave lleva la fecha, así la misma clase vuelve a avisar otro día', () => {
    expect(claveAviso(JUEVES, 'h9')).toBe(`${JUEVES}:h9`);
    expect(claveAviso('2026-08-20', 'h9')).not.toBe(claveAviso(JUEVES, 'h9'));
  });

  it('esDeHoy distingue la fecha de la clave', () => {
    expect(esDeHoy(`${JUEVES}:h9`, JUEVES)).toBe(true);
    expect(esDeHoy(`${JUEVES}:h9`, '2026-08-20')).toBe(false);
  });
});

describe('avisosPendientes', () => {
  const analisis = () => avisable('Análisis', [horario(4, '19:50', '21:30')]);

  it('no avisa a 11 minutos (todavía fuera de la ventana)', () => {
    expect(avisosPendientes([analisis()], ba(`${JUEVES} 19:39`), sinAvisar)).toEqual([]);
  });

  it('avisa exactamente en el borde de la ventana', () => {
    expect(MIN_ANTES_ASISTENCIA).toBe(10); // el borde es este número, no un 10 hardcodeado
    const r = avisosPendientes([analisis()], ba(`${JUEVES} 19:40`), sinAvisar);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ nombre: 'Análisis', inicio: '19:50', faltan: 10 });
  });

  it('avisa a 1 minuto', () => {
    const r = avisosPendientes([analisis()], ba(`${JUEVES} 19:49`), sinAvisar);
    expect(r[0]?.faltan).toBe(1);
  });

  it('NO avisa una clase ya empezada, aunque la ventana siga activa', () => {
    expect(avisosPendientes([analisis()], ba(`${JUEVES} 19:50`), sinAvisar)).toEqual([]);
    expect(avisosPendientes([analisis()], ba(`${JUEVES} 20:30`), sinAvisar)).toEqual([]);
  });

  it('no avisa una clase terminada', () => {
    expect(avisosPendientes([analisis()], ba(`${JUEVES} 21:30`), sinAvisar)).toEqual([]);
  });

  it('no repite un aviso ya dado', () => {
    const m = analisis();
    const ahora = ba(`${JUEVES} 19:45`);
    const primero = avisosPendientes([m], ahora, sinAvisar);
    expect(primero).toHaveLength(1);
    expect(avisosPendientes([m], ahora, new Set([primero[0]!.clave]))).toEqual([]);
  });

  it('el mismo horario vuelve a avisar la semana siguiente', () => {
    const m = analisis();
    const clave = avisosPendientes([m], ba(`${JUEVES} 19:45`), sinAvisar)[0]!.clave;
    // Jueves 20/08, misma clase, con la clave de la semana pasada ya marcada.
    const r = avisosPendientes([m], ba('2026-08-20 19:45'), new Set([clave]));
    expect(r).toHaveLength(1);
  });

  it('avisa las dos clases si dos materias arrancan juntas', () => {
    const materias = [
      avisable('Análisis', [horario(4, '19:50', '21:30')]),
      avisable('Bases', [horario(4, '19:50', '21:30')]),
    ];
    expect(avisosPendientes(materias, ba(`${JUEVES} 19:45`), sinAvisar)).toHaveLength(2);
  });

  it('ignora los horarios de otros días', () => {
    const lunes = avisable('Análisis', [horario(1, '19:50', '21:30')]);
    expect(avisosPendientes([lunes], ba(`${JUEVES} 19:45`), sinAvisar)).toEqual([]);
  });

  it('domingo no se cursa: nunca avisa', () => {
    const dom = avisable('Fantasma', [horario(4, '19:50', '21:30')]);
    expect(avisosPendientes([dom], ba(`${DOMINGO} 19:45`), sinAvisar)).toEqual([]);
  });

  it('sin materias no explota', () => {
    expect(avisosPendientes([], ba(`${JUEVES} 19:45`), sinAvisar)).toEqual([]);
  });
});
