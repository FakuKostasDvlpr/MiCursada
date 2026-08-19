import { describe, expect, it } from 'vitest';
import {
  agregarFranja,
  alternarDia,
  componerHora,
  diasSolapados,
  editarFranja,
  franjaValida,
  minutosOfrecidos,
  ordenarFranjas,
  partirHora,
  quitarFranja,
  type Franja,
} from '@/lib/franjas';

const f = (dia: number, inicio = '19:00', fin = '23:00'): Franja => ({ dia, inicio, fin });

describe('franjaValida', () => {
  it('acepta un rango normal', () => {
    expect(franjaValida('19:00', '23:00')).toBe(true);
  });

  it('rechaza fin anterior o igual al inicio', () => {
    expect(franjaValida('21:00', '19:00')).toBe(false);
    expect(franjaValida('19:00', '19:00')).toBe(false);
  });

  it('rechaza horas mal formadas', () => {
    expect(franjaValida('', '23:00')).toBe(false);
    expect(franjaValida('9:00', '23:00')).toBe(false);
  });

  it('acepta el corte real de Matemáticas e Inglés', () => {
    expect(franjaValida('19:00', '21:40')).toBe(true);
    expect(franjaValida('21:40', '23:00')).toBe(true);
  });
});

describe('alternarDia', () => {
  it('marca con la franja por defecto si no había nada', () => {
    expect(alternarDia([], 1)).toEqual([f(1)]);
  });

  it('desmarca un día ya marcado', () => {
    expect(alternarDia([f(1)], 1)).toEqual([]);
  });

  it('copia la franja que la materia ya usa, no la genérica', () => {
    expect(alternarDia([f(3, '19:00', '21:40')], 1)).toEqual([
      f(1, '19:00', '21:40'),
      f(3, '19:00', '21:40'),
    ]);
  });

  it('saca todas las franjas de ese día', () => {
    const previos = [f(3, '19:00', '21:40'), f(3, '21:40', '23:00')];
    expect(alternarDia(previos, 3)).toEqual([]);
  });
});

describe('agregarFranja', () => {
  it('desde vacío arranca el lunes de 19 a 23', () => {
    expect(agregarFranja([])).toEqual([f(1)]);
  });

  it('elige el primer día libre', () => {
    expect(agregarFranja([f(1), f(2)]).map((x) => x.dia)).toEqual([1, 2, 3]);
  });

  it('con la semana llena repite el último día', () => {
    const llena = [f(1), f(2), f(3), f(4), f(5), f(6)];
    const r = agregarFranja(llena);
    expect(r).toHaveLength(7);
    expect(r.filter((x) => x.dia === 6)).toHaveLength(2);
  });
});

describe('editarFranja', () => {
  it('cambia la hora de fin de una sola franja', () => {
    const previos = [f(3), f(4)];
    expect(editarFranja(previos, 0, { fin: '21:40' })).toEqual([f(3, '19:00', '21:40'), f(4)]);
  });

  it('cambia el día', () => {
    expect(editarFranja([f(1)], 0, { dia: 5 })).toEqual([f(5)]);
  });

  it('no reordena mientras se edita (el foco no se puede mover solo)', () => {
    const previos = [f(5), f(1)];
    expect(editarFranja(previos, 0, { inicio: '20:00' }).map((x) => x.dia)).toEqual([5, 1]);
  });

  it('un índice inexistente no rompe ni cambia nada', () => {
    expect(editarFranja([f(1)], 9, { fin: '22:00' })).toEqual([f(1)]);
  });
});

describe('quitarFranja', () => {
  it('saca la del índice', () => {
    expect(quitarFranja([f(1), f(3)], 0)).toEqual([f(3)]);
  });

  it('con una sola queda vacío', () => {
    expect(quitarFranja([f(1)], 0)).toEqual([]);
  });
});

describe('ordenarFranjas', () => {
  it('ordena por día y después por hora', () => {
    const desordenadas = [f(4, '21:40', '23:00'), f(1), f(4, '19:00', '20:20')];
    expect(ordenarFranjas(desordenadas).map((x) => [x.dia, x.inicio])).toEqual([
      [1, '19:00'],
      [4, '19:00'],
      [4, '21:40'],
    ]);
  });
});

describe('diasSolapados', () => {
  it('sin choques no devuelve nada', () => {
    const jueves = [f(4, '19:00', '20:20'), f(4, '20:20', '21:40'), f(4, '21:40', '23:00')];
    expect(diasSolapados(jueves)).toEqual([]);
  });

  it('detecta dos materias pisadas el mismo día', () => {
    expect(diasSolapados([f(3), f(3)])).toEqual([3]);
  });

  it('el corte exacto no es solapamiento', () => {
    expect(diasSolapados([f(3, '19:00', '21:40'), f(3, '21:40', '23:00')])).toEqual([]);
  });

  it('detecta un solapamiento parcial', () => {
    expect(diasSolapados([f(3, '19:00', '21:00'), f(3, '20:00', '23:00')])).toEqual([3]);
  });

  it('días distintos nunca chocan entre sí', () => {
    expect(diasSolapados([f(1), f(2), f(3)])).toEqual([]);
  });

  it('devuelve todos los días con choque, ordenados', () => {
    expect(diasSolapados([f(5), f(5), f(2), f(2)])).toEqual([2, 5]);
  });
});

describe('partirHora / componerHora', () => {
  it('parte una hora válida', () => {
    expect(partirHora('19:40')).toEqual({ hora: 19, minuto: 40 });
  });

  it('parte la medianoche', () => {
    expect(partirHora('00:00')).toEqual({ hora: 0, minuto: 0 });
  });

  it('rechaza formatos que no son HH:MM', () => {
    expect(partirHora('9:00')).toBeNull();
    expect(partirHora('')).toBeNull();
    expect(partirHora('19:00:00')).toBeNull();
  });

  it('rechaza horas y minutos fuera de rango', () => {
    expect(partirHora('24:00')).toBeNull();
    expect(partirHora('19:60')).toBeNull();
  });

  it('compone siempre con dos dígitos y en 24 h', () => {
    expect(componerHora(9, 5)).toBe('09:05');
    expect(componerHora(19, 0)).toBe('19:00');
    expect(componerHora(23, 0)).toBe('23:00');
  });

  it('ida y vuelta no pierde nada', () => {
    for (const h of ['00:00', '07:05', '19:00', '21:40', '23:55']) {
      const p = partirHora(h);
      expect(p && componerHora(p.hora, p.minuto)).toBe(h);
    }
  });
});

describe('minutosOfrecidos', () => {
  it('ofrece los múltiplos del paso', () => {
    expect(minutosOfrecidos(0)).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
  });

  it('incluye 20 y 40, que son los reales de la cursada', () => {
    expect(minutosOfrecidos(0)).toContain(20);
    expect(minutosOfrecidos(0)).toContain(40);
  });

  it('agrega el valor actual si no cae en la grilla, sin perderlo', () => {
    const r = minutosOfrecidos(7);
    expect(r).toContain(7);
    expect(r.indexOf(7)).toBe(r.indexOf(5) + 1);
  });
});
