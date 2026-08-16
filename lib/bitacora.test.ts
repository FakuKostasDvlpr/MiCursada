import { fromZonedTime } from 'date-fns-tz';
import { describe, expect, it } from 'vitest';
import {
  agruparPorDia,
  coincide,
  diaDeBloque,
  etiquetaDia,
  DIA_SIN_FECHA,
} from '@/lib/bitacora';
import type { Bloque } from '@/lib/types';

const TZ = 'America/Argentina/Buenos_Aires';

/** Date UTC a partir de hora de pared de Buenos Aires. */
const ba = (s: string) => fromZonedTime(s, TZ);

let seq = 0;
const bloque = (createdAt: string, extra: Partial<Bloque> = {}): Bloque => ({
  id: `b${++seq}`,
  materiaId: 'curso:1',
  tipo: 'texto',
  texto: 'nota',
  url: '',
  estado: 'pendiente',
  hecho: false,
  orden: 1000,
  createdAt,
  ...extra,
});

// Jueves 13/08/2026 es "hoy" de referencia; miércoles 12/08 es "ayer".
const HOY = '2026-08-13';
const AYER = '2026-08-12';
const AHORA = ba(`${HOY} 20:00`);

describe('diaDeBloque', () => {
  it('deriva el día calendario en Buenos Aires desde createdAt', () => {
    expect(diaDeBloque(bloque(ba(`${HOY} 20:00`).toISOString()))).toBe(HOY);
  });

  it('un instante UTC de la madrugada sigue siendo el día anterior en BA', () => {
    // 2026-08-14T02:00Z = 2026-08-13 23:00 en Buenos Aires (UTC-3).
    expect(diaDeBloque(bloque('2026-08-14T02:00:00.000Z'))).toBe(HOY);
  });

  it('cae al grupo sin fecha con createdAt inválido, vacío o ausente', () => {
    expect(diaDeBloque(bloque('no-es-fecha'))).toBe(DIA_SIN_FECHA);
    expect(diaDeBloque(bloque(''))).toBe(DIA_SIN_FECHA);
    expect(diaDeBloque({ createdAt: undefined as unknown as string })).toBe(DIA_SIN_FECHA);
  });
});

describe('etiquetaDia', () => {
  it('usa Hoy y Ayer para los dos últimos días', () => {
    expect(etiquetaDia(HOY, AHORA)).toBe('Hoy');
    expect(etiquetaDia(AYER, AHORA)).toBe('Ayer');
  });

  it('usa el formato largo en español para el resto del año en curso', () => {
    expect(etiquetaDia('2026-08-06', AHORA)).toBe('Jueves 6 de agosto');
  });

  it('agrega el año cuando es distinto al de ahora', () => {
    expect(etiquetaDia('2025-08-13', AHORA)).toBe('Miércoles 13 de agosto de 2025');
  });
});

describe('agruparPorDia', () => {
  it('separa los bloques de hoy y los de ayer', () => {
    const grupos = agruparPorDia(
      [
        bloque(ba(`${AYER} 19:00`).toISOString(), { texto: 'de ayer' }),
        bloque(ba(`${HOY} 19:00`).toISOString(), { texto: 'de hoy' }),
      ],
      AHORA
    );
    expect(grupos.map((g) => g.etiqueta)).toEqual(['Hoy', 'Ayer']);
    expect(grupos[0]?.esHoy).toBe(true);
    expect(grupos[0]?.bloques.map((b) => b.texto)).toEqual(['de hoy']);
    expect(grupos[1]?.esHoy).toBe(false);
    expect(grupos[1]?.bloques.map((b) => b.texto)).toEqual(['de ayer']);
  });

  it('parte los días en la medianoche de Buenos Aires', () => {
    const antes = bloque(ba(`${AYER} 23:50`).toISOString(), { texto: 'antes' });
    const despues = bloque(ba(`${HOY} 00:10`).toISOString(), { texto: 'despues' });
    const grupos = agruparPorDia([antes, despues], AHORA);
    expect(grupos).toHaveLength(2);
    expect(grupos[0]?.dia).toBe(HOY);
    expect(grupos[0]?.etiqueta).toBe('Hoy');
    expect(grupos[0]?.bloques.map((b) => b.texto)).toEqual(['despues']);
    expect(grupos[1]?.dia).toBe(AYER);
    expect(grupos[1]?.bloques.map((b) => b.texto)).toEqual(['antes']);
  });

  it('ordena los días del más reciente al más viejo', () => {
    const grupos = agruparPorDia(
      [
        bloque(ba('2026-08-01 10:00').toISOString()),
        bloque(ba(`${HOY} 10:00`).toISOString()),
        bloque(ba('2026-08-10 10:00').toISOString()),
      ],
      AHORA
    );
    expect(grupos.map((g) => g.dia)).toEqual([HOY, '2026-08-10', '2026-08-01']);
  });

  it('manda el grupo sin fecha al final', () => {
    const grupos = agruparPorDia(
      [bloque('vaya-uno-a-saber'), bloque(ba(`${HOY} 10:00`).toISOString())],
      AHORA
    );
    expect(grupos.map((g) => g.dia)).toEqual([HOY, DIA_SIN_FECHA]);
    expect(grupos[1]?.etiqueta).toBe('Sin fecha');
    expect(grupos[1]?.esHoy).toBe(false);
  });

  it('ordena por `orden` dentro de cada día', () => {
    const grupos = agruparPorDia(
      [
        bloque(ba(`${HOY} 10:00`).toISOString(), { orden: 3000, texto: 'c' }),
        bloque(ba(`${HOY} 10:00`).toISOString(), { orden: 1000, texto: 'a' }),
        bloque(ba(`${HOY} 10:00`).toISOString(), { orden: 2000, texto: 'b' }),
      ],
      AHORA
    );
    expect(grupos[0]?.bloques.map((b) => b.texto)).toEqual(['a', 'b', 'c']);
  });

  it('sin bloques devuelve una lista vacía', () => {
    expect(agruparPorDia([], AHORA)).toEqual([]);
  });
});

describe('coincide', () => {
  it('ignora mayúsculas y acentos en el texto', () => {
    expect(coincide(bloque(HOY, { texto: 'Integración numérica' }), 'integracion')).toBe(true);
    expect(coincide(bloque(HOY, { texto: 'Integración numérica' }), 'NUMÉRICA')).toBe(true);
    expect(coincide(bloque(HOY, { texto: 'Integración numérica' }), 'derivada')).toBe(false);
  });

  it('también busca en la url', () => {
    expect(coincide(bloque(HOY, { texto: '', url: 'https://campus.edu/tp5' }), 'campus')).toBe(true);
  });

  it('una consulta vacía matchea todo', () => {
    expect(coincide(bloque(HOY, { texto: 'lo que sea' }), '   ')).toBe(true);
  });
});
