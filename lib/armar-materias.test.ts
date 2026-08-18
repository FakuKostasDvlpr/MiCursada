import { describe, expect, it } from 'vitest';
import { armarAvisos, armarMaterias } from '@/lib/armar-materias';

const curso = {
  id: 'curso:2756',
  nombre: 'Fundamentos',
  datos: {
    nombre: 'Fundamentos',
    source: 'moodle',
    archivos: [{ id: 'mod:9', nombre: 'TP1.pdf', url: 'https://x/9' }],
    secciones: [],
  },
};

describe('armarMaterias', () => {
  it('mezcla curso compartido + overlays personales', () => {
    const materias = armarMaterias(
      [curso],
      [{ curso_id: 'curso:2756', profe: 'Vero', aula: '3B', color: '#a78bfa' }],
      [{ id: 'h1', curso_id: 'curso:2756', dia: 2, inicio: '18:10:00', fin: '21:30:00' }],
      [{ id: 'b1', curso_id: 'curso:2756', tipo: 'texto', texto: 'hola', url: '', estado: 'pendiente', hecho: false, orden: 1000, created_at: '2026-08-18T00:00:00Z', fmt: { b: true }, ref: null }],
      [{ id: 'a1', curso_id: 'curso:2756', nombre: 'Apunte', url: 'https://y' }]
    );
    expect(materias).toHaveLength(1);
    const m = materias[0]!;
    expect(m.id).toBe('curso:2756');
    expect(m.profe).toBe('Vero');
    expect(m.color).toBe('#a78bfa');
    expect(m.horarios[0]).toMatchObject({ dia: 2, inicio: '18:10', fin: '21:30' });
    expect(m.archivos.map((a) => a.id)).toEqual(['mod:9', 'a1']); // aula primero, manuales después
    expect(m.bloques[0]!.texto).toBe('hola');
    // Los jsonb nuevos del 17/08 tienen que sobrevivir el armado.
    expect(m.bloques[0]!.fmt).toEqual({ b: true });
    expect(m.bloques[0]!.ref).toBeUndefined();
  });

  it('sin overlay usa defaults', () => {
    const [m] = armarMaterias([curso], [], [], [], []);
    expect(m!.profe).toBe('');
    expect(m!.color).toBe('#38bdf8');
  });
});

describe('armarAvisos', () => {
  it('mezcla avisos del curso (con estado personal) y manuales, ordenado por fecha', () => {
    const avisos = armarAvisos(
      [{ id: 'assign:1', curso_id: 'curso:2756', titulo: 'TP', fecha: '2026-09-01' }],
      [{ aviso_id: 'assign:1', hecho: true }],
      [{ id: 'm1', curso_id: null, titulo: 'Comprar carpeta', fecha: '2026-08-20', hecho: false, nota_id: 'b1' }]
    );
    expect(avisos.map((a) => a.id)).toEqual(['m1', 'assign:1']);
    expect(avisos[1]!.hecho).toBe(true);
    expect(avisos[0]!.materiaId).toBeNull();
    // El vínculo aviso→nota viaja; los avisos del aula no tienen nota.
    expect(avisos[0]!.notaId).toBe('b1');
    expect(avisos[1]!.notaId).toBeNull();
  });
});
