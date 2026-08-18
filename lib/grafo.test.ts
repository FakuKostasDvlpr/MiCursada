import { describe, expect, it } from 'vitest';
import {
  ALFA_QUIETA,
  ALTO,
  ANCHO,
  CENTRO_X,
  CENTRO_Y,
  armarGrafo,
  cadenaEncendida,
  firmaGrafo,
  tickGrafo,
  totalesGrafo,
} from './grafo';
import type { Archivo, Aviso, Bloque, Materia } from './types';

const bloque = (id: string, extra: Partial<Bloque> = {}): Bloque => ({
  id,
  materiaId: 'm1',
  tipo: 'texto',
  texto: `nota ${id}`,
  url: '',
  estado: 'pendiente',
  hecho: false,
  orden: 1000,
  createdAt: '2026-08-16T12:00:00.000Z',
  ...extra,
});

const archivo = (id: string, extra: Partial<Archivo> = {}): Archivo => ({
  id,
  materiaId: 'm1',
  nombre: `archivo ${id}`,
  url: 'https://www.ejemplo.com/guia.pdf',
  ...extra,
});

const materia = (id: string, extra: Partial<Materia> = {}): Materia => ({
  id,
  nombre: `Materia ${id}`,
  profe: 'Profe',
  aula: 'Aula 1',
  color: '#38bdf8',
  source: 'moodle',
  horarios: [],
  bloques: [],
  archivos: [],
  ...extra,
});

const aviso = (id: string, extra: Partial<Aviso> = {}): Aviso => ({
  id,
  materiaId: 'm1',
  titulo: `Aviso ${id}`,
  fecha: '2026-09-22',
  hecho: false,
  ...extra,
});

describe('armarGrafo', () => {
  it('sin materias queda solo el nodo central', () => {
    const g = armarGrafo([], [], 'FC');
    expect(g.nodos).toHaveLength(1);
    expect(g.nodos[0]).toMatchObject({ id: 'yo', tipo: 'yo', x: CENTRO_X, y: CENTRO_Y });
    expect(g.aristas).toHaveLength(0);
  });

  it('cuelga una materia del centro y sus ítems de la materia', () => {
    const g = armarGrafo(
      [materia('m1', { bloques: [bloque('b1')], archivos: [archivo('f1')] })],
      [aviso('a1')],
      'FC'
    );
    // yo + materia + nota + archivo + aviso
    expect(g.nodos.map((n) => n.tipo)).toEqual(['yo', 'materia', 'nota', 'archivo', 'aviso']);
    expect(g.aristas).toHaveLength(4);
    // centro → materia, y materia → cada ítem
    expect(g.aristas[0]?.a.id).toBe('yo');
    expect(g.aristas[0]?.b.id).toBe('m1');
    expect(g.aristas.slice(1).every((l) => l.a.id === 'm1')).toBe(true);
  });

  it('los divisores no son notas y los avisos hechos no entran', () => {
    const g = armarGrafo(
      [materia('m1', { bloques: [bloque('b1', { tipo: 'divisor' }), bloque('b2')] })],
      [aviso('a1', { hecho: true }), aviso('a2')],
      'FC'
    );
    expect(g.nodos.filter((n) => n.tipo === 'nota')).toHaveLength(1);
    expect(g.nodos.filter((n) => n.tipo === 'aviso')).toHaveLength(1);
  });

  it('el radio de la materia crece con sus ítems y se topa en 25', () => {
    const chica = armarGrafo([materia('m1')], [], 'FC');
    expect(chica.nodos[1]?.r).toBe(13);

    const bloques = Array.from({ length: 40 }, (_, i) => bloque(`b${i}`));
    const grande = armarGrafo([materia('m1', { bloques })], [], 'FC');
    expect(grande.nodos[1]?.r).toBe(25);
  });

  it('el aviso de otra materia no cuelga de ésta', () => {
    const g = armarGrafo([materia('m1')], [aviso('a1', { materiaId: 'otra' })], 'FC');
    expect(g.nodos.filter((n) => n.tipo === 'aviso')).toHaveLength(0);
  });

  it('el tooltip del archivo muestra el dominio y el del aviso la fecha', () => {
    const g = armarGrafo(
      [materia('m1', { archivos: [archivo('f1')] })],
      [aviso('a1', { fecha: '2026-09-22' })],
      'FC'
    );
    expect(g.nodos.find((n) => n.tipo === 'archivo')?.sub).toBe('ejemplo.com');
    expect(g.nodos.find((n) => n.tipo === 'aviso')?.sub).toBe('22/09 · pendiente');
  });

  it('los rótulos largos se cortan y el nodo central no es clickeable', () => {
    const g = armarGrafo(
      [materia('m1', { nombre: 'Taller de Herramientas de Programación - Plan 2 años' })],
      [],
      'FC'
    );
    expect(g.nodos[1]?.rotulo).toHaveLength(22);
    expect(g.nodos[1]?.rotulo.endsWith('…')).toBe(true);
    expect(g.nodos[1]?.titulo).toBe('Taller de Herramientas de Programación - Plan 2 años');
    expect(g.nodos[0]?.href).toBe(null);
    expect(g.nodos[1]?.href).toBe('/materias/m1');
  });

  it('el id de materia con ":" viaja percent-encoded en el href', () => {
    const g = armarGrafo([materia('curso:2756')], [], 'FC');
    expect(g.nodos[1]?.href).toBe('/materias/curso%3A2756');
  });

  it('la posición inicial de un ítem es estable entre llamadas', () => {
    const datos = () => armarGrafo([materia('m1', { bloques: [bloque('b1')] })], [], 'FC');
    const a = datos().nodos[2];
    const b = datos().nodos[2];
    expect([a?.x, a?.y]).toEqual([b?.x, b?.y]);
  });
});

describe('tickGrafo', () => {
  it('enfría hasta 0.02 y no más abajo', () => {
    const g = armarGrafo([materia('m1')], [], 'FC');
    for (let i = 0; i < 1000; i++) tickGrafo(g);
    expect(g.alfa).toBe(0.02);
  });

  it('se asienta: después de un rato el alfa cae por debajo del umbral', () => {
    const g = armarGrafo([materia('m1'), materia('m2')], [], 'FC');
    let pasos = 0;
    while (g.alfa > ALFA_QUIETA && pasos < 2000) {
      tickGrafo(g);
      pasos++;
    }
    expect(g.alfa).toBeLessThanOrEqual(ALFA_QUIETA);
    expect(pasos).toBeLessThan(2000);
  });

  it('el nodo central no se mueve', () => {
    const g = armarGrafo([materia('m1'), materia('m2'), materia('m3')], [], 'FC');
    for (let i = 0; i < 200; i++) tickGrafo(g);
    expect(g.nodos[0]?.x).toBe(CENTRO_X);
    expect(g.nodos[0]?.y).toBe(CENTRO_Y);
  });

  it('ningún nodo se va del lienzo', () => {
    const materias = Array.from({ length: 8 }, (_, i) =>
      materia(`m${i}`, {
        bloques: Array.from({ length: 6 }, (_, j) => bloque(`b${i}-${j}`)),
      })
    );
    const g = armarGrafo(materias, [], 'FC');
    for (let i = 0; i < 400; i++) tickGrafo(g);
    for (const n of g.nodos) {
      expect(n.x).toBeGreaterThanOrEqual(18);
      expect(n.x).toBeLessThanOrEqual(ANCHO - 18);
      expect(n.y).toBeGreaterThanOrEqual(18);
      expect(n.y).toBeLessThanOrEqual(ALTO - 18);
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
    }
  });
});

describe('cadenaEncendida', () => {
  const g = armarGrafo(
    [
      materia('m1', { bloques: [bloque('b1')] }),
      materia('m2', { bloques: [bloque('b2', { materiaId: 'm2' })] }),
    ],
    [],
    'FC'
  );

  it('sin hover no hay nada encendido', () => {
    expect(cadenaEncendida(g, null).size).toBe(0);
  });

  it('un ítem enciende ítem → materia → centro, y nada más', () => {
    expect(cadenaEncendida(g, 'nb1')).toEqual(new Set(['nb1', 'm1', 'yo']));
  });

  it('una materia enciende su rama entera', () => {
    expect(cadenaEncendida(g, 'm1')).toEqual(new Set(['m1', 'yo', 'nb1']));
  });

  it('el centro enciende todo', () => {
    expect(cadenaEncendida(g, 'yo').size).toBe(g.nodos.length);
  });

  it('un id que no existe no enciende nada', () => {
    expect(cadenaEncendida(g, 'fantasma').size).toBe(0);
  });
});

describe('totalesGrafo y firmaGrafo', () => {
  it('cuenta notas (sin divisores), archivos y avisos pendientes', () => {
    const totales = totalesGrafo(
      [
        materia('m1', {
          bloques: [bloque('b1'), bloque('b2', { tipo: 'divisor' })],
          archivos: [archivo('f1')],
        }),
      ],
      [aviso('a1'), aviso('a2', { hecho: true })]
    );
    expect(totales).toEqual({ materias: 1, notas: 1, archivos: 1, avisos: 1 });
  });

  it('la firma cambia si aparece una nota y no si cambia solo el texto', () => {
    const base = [materia('m1', { bloques: [bloque('b1')] })];
    const conOtroTexto = [materia('m1', { bloques: [bloque('b1', { texto: 'otro' })] })];
    const conDos = [materia('m1', { bloques: [bloque('b1'), bloque('b2')] })];
    expect(firmaGrafo(base, [])).toBe(firmaGrafo(conOtroTexto, []));
    expect(firmaGrafo(base, [])).not.toBe(firmaGrafo(conDos, []));
  });

  it('la firma ignora los avisos ya hechos', () => {
    expect(firmaGrafo([], [aviso('a1', { hecho: true })])).toBe(firmaGrafo([], []));
  });
});
