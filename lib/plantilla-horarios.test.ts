import { describe, expect, it } from 'vitest';
import {
  ANALISTA_NOCHE,
  claveMateria,
  horariosSembrables,
  type FranjaPlantilla,
} from '@/lib/plantilla-horarios';

describe('claveMateria', () => {
  it('recorta el sufijo del plan que agrega el aula virtual', () => {
    expect(claveMateria('Matemáticas - Plan 2 años 2°Semestre 2026')).toBe('matematicas');
  });

  it('matchea el mismo nombre en semestres y años distintos', () => {
    const a = claveMateria('Inglés - Plan 2 años 2°Semestre 2026');
    const b = claveMateria('Inglés - Plan 2 años 1°Semestre 2027');
    expect(a).toBe(b);
  });

  it('ignora acentos, mayúsculas y espacios de más', () => {
    expect(claveMateria('  ORGANIZACIÓN   Empresarial ')).toBe('organizacion empresarial');
  });

  it('deja pasar un nombre sin sufijo', () => {
    expect(claveMateria('Fundamentos de Programación')).toBe('fundamentos de programacion');
  });

  it('no recorta un guion que no introduce el plan', () => {
    expect(claveMateria('Taller de Creatividad e Innovación')).toBe(
      'taller de creatividad e innovacion'
    );
  });
});

describe('horariosSembrables', () => {
  const materia = (id: string, nombre: string) => ({ id, nombre });

  it('siembra la franja de cada materia que está en la plantilla', () => {
    const filas = horariosSembrables([
      materia('c1', 'Matemáticas - Plan 2 años 2°Semestre 2026'),
    ]);
    expect(filas).toEqual([{ curso_id: 'c1', dia: 3, inicio: '19:00', fin: '21:40' }]);
  });

  it('respeta la cantidad real: solo siembra las materias que cursa', () => {
    const filas = horariosSembrables([
      materia('c1', 'Inglés - Plan 2 años 2°Semestre 2026'),
      materia('c2', 'Organización Empresarial - Plan 2 años 2°Semestre 2026'),
    ]);
    expect(filas).toHaveLength(2);
    expect(filas.map((f) => f.curso_id).sort()).toEqual(['c1', 'c2']);
  });

  it('no inventa horario para una materia que no está en la plantilla', () => {
    expect(horariosSembrables([materia('c9', 'Astrofísica Aplicada')])).toEqual([]);
  });

  it('devuelve la grilla completa cuando cursa las siete', () => {
    const todas = ANALISTA_NOCHE.map((f, i) => materia(`c${i}`, `${f.materia} - Plan 2 años 2°Semestre 2026`));
    expect(horariosSembrables(todas)).toHaveLength(ANALISTA_NOCHE.length);
  });

  it('sin materias no siembra nada', () => {
    expect(horariosSembrables([])).toEqual([]);
  });

  it('soporta una materia con más de una franja en la semana', () => {
    const plantilla: FranjaPlantilla[] = [
      { materia: 'Taller', dia: 1, inicio: '19:00', fin: '21:00' },
      { materia: 'Taller', dia: 5, inicio: '19:00', fin: '21:00' },
    ];
    const filas = horariosSembrables([materia('c1', 'Taller')], plantilla);
    expect(filas.map((f) => f.dia)).toEqual([1, 5]);
  });

  it('todas las franjas caen en días válidos y de noche', () => {
    for (const f of ANALISTA_NOCHE) {
      expect(f.dia).toBeGreaterThanOrEqual(1);
      expect(f.dia).toBeLessThanOrEqual(6);
      expect(f.inicio < f.fin).toBe(true);
      expect(f.inicio >= '18:00').toBe(true);
    }
  });
});
