import { describe, expect, it } from 'vitest';
import { grillaConsensuada, type FilaHorario } from '@/lib/horarios-comision';

const f = (user_id: string, dia: number, inicio = '19:00', fin = '23:00'): FilaHorario => ({
  user_id,
  dia,
  inicio,
  fin,
});

describe('grillaConsensuada', () => {
  it('sin nadie cargado no hereda nada', () => {
    expect(grillaConsensuada([])).toEqual([]);
  });

  it('con una sola persona copia su grilla', () => {
    expect(grillaConsensuada([f('a', 1)])).toEqual([{ dia: 1, inicio: '19:00', fin: '23:00' }]);
  });

  it('devuelve la grilla ordenada por día', () => {
    const r = grillaConsensuada([f('a', 4), f('a', 1), f('a', 6)]);
    expect(r.map((x) => x.dia)).toEqual([1, 4, 6]);
  });

  it('gana la grilla que más gente comparte', () => {
    const filas = [
      f('a', 1),
      f('b', 1),
      f('c', 5), // la rara, una sola persona
    ];
    expect(grillaConsensuada(filas)).toEqual([{ dia: 1, inicio: '19:00', fin: '23:00' }]);
  });

  it('no mezcla franjas de personas distintas', () => {
    // `a` cursa lunes, `b` cursa jueves. El resultado tiene que ser una de las
    // dos grillas enteras, nunca lunes+jueves juntos.
    const r = grillaConsensuada([f('a', 1), f('b', 4)]);
    expect(r).toHaveLength(1);
    expect([1, 4]).toContain(r[0]?.dia);
  });

  it('con empate de votos gana la grilla más completa', () => {
    const filas = [f('a', 1), f('b', 1), f('b', 3)];
    expect(grillaConsensuada(filas).map((x) => x.dia)).toEqual([1, 3]);
  });

  it('respeta franjas que no son la de 19 a 23', () => {
    const filas = [f('a', 3, '19:00', '21:40'), f('a', 3, '21:40', '23:00')];
    expect(grillaConsensuada(filas)).toEqual([
      { dia: 3, inicio: '19:00', fin: '21:40' },
      { dia: 3, inicio: '21:40', fin: '23:00' },
    ]);
  });

  it('es determinístico: mismo input, mismo resultado', () => {
    const filas = [f('a', 1), f('b', 4)];
    const uno = grillaConsensuada(filas);
    const dos = grillaConsensuada([...filas].reverse());
    expect(uno).toEqual(dos);
  });
});
