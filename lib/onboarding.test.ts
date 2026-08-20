import { describe, expect, it } from 'vitest';
import {
  MS_CIERRE_ONBOARDING,
  MS_TAREA,
  PASOS_ONBOARDING,
  TAREAS_ONBOARDING,
  estadoTarea,
  kickerOnboarding,
  labelBotonOnboarding,
  opacidadTarea,
} from '@/lib/onboarding';

describe('contenido de los pasos', () => {
  it('son tres pasos con tres features cada uno', () => {
    expect(PASOS_ONBOARDING).toHaveLength(3);
    for (const paso of PASOS_ONBOARDING) {
      expect(paso.features).toHaveLength(3);
      expect(paso.titulo.length).toBeGreaterThan(0);
      expect(paso.descripcion.length).toBeGreaterThan(0);
    }
  });

  it('trae el copy exacto del prototipo', () => {
    expect(PASOS_ONBOARDING.map((p) => p.titulo)).toEqual([
      'Tu semana, de un vistazo',
      'Notas como en Notion',
      'Todo conectado',
    ]);
    expect(PASOS_ONBOARDING[0].features[2]).toEqual({
      texto: 'Avisos: hoy en ámbar, vencidos en rojo',
      color: '#fb7185',
      tag: 'AVISOS',
    });
    expect(PASOS_ONBOARDING[1].features[0].tag).toBe('/ COMANDO');
  });

  it('los tiles van en el color de cada paso', () => {
    expect(PASOS_ONBOARDING.map((p) => p.tile)).toEqual(['#fbbf24', '#38bdf8', '#a78bfa']);
  });

  it('usa voseo en el copy visible', () => {
    // "escribí", "referenciá", "organizá" — nada de "escribe" / "referencia tú".
    expect(PASOS_ONBOARDING[1].descripcion).toContain('escribí');
    expect(PASOS_ONBOARDING[1].descripcion).toContain('organizá');
  });
});

describe('kicker y botón', () => {
  it('numera los pasos desde 1', () => {
    expect(kickerOnboarding(0)).toBe('Paso 1 de 3');
    expect(kickerOnboarding(2)).toBe('Paso 3 de 3');
  });

  it('dice Empezar solo en el último paso', () => {
    expect(labelBotonOnboarding(0)).toBe('Siguiente');
    expect(labelBotonOnboarding(1)).toBe('Siguiente');
    expect(labelBotonOnboarding(2)).toBe('Empezar');
  });
});

describe('checklist del loader', () => {
  it('son tres tareas, en el orden del handoff', () => {
    expect(TAREAS_ONBOARDING).toEqual([
      'Sincronizando con el aula virtual',
      'Cargando materias y horarios',
      'Preparando notas y tablero',
    ]);
  });

  it('antes de arrancar todo está pendiente', () => {
    expect([0, 1, 2].map((i) => estadoTarea(i, -1))).toEqual([
      'pendiente',
      'pendiente',
      'pendiente',
    ]);
  });

  it('con la segunda en curso, la primera ya está hecha y la tercera espera', () => {
    expect([0, 1, 2].map((i) => estadoTarea(i, 1))).toEqual(['hecha', 'activa', 'pendiente']);
  });

  it('al terminar la timeline las tres quedan hechas', () => {
    expect([0, 1, 2].map((i) => estadoTarea(i, TAREAS_ONBOARDING.length))).toEqual([
      'hecha',
      'hecha',
      'hecha',
    ]);
  });

  it('solo la pendiente se atenúa', () => {
    expect(opacidadTarea('pendiente')).toBe(0.45);
    expect(opacidadTarea('activa')).toBe(1);
    expect(opacidadTarea('hecha')).toBe(1);
  });
});

describe('timeline', () => {
  it('son los ms exactos del prototipo y van en orden', () => {
    expect(MS_TAREA).toEqual([0, 950, 1850, 2700]);
    expect(MS_CIERRE_ONBOARDING).toBe(3400);
  });

  it('hay un hueco entre la última tarea y el cierre', () => {
    // Sin ese hueco, el tercer check no se llega a ver antes de que el overlay
    // se vaya. Es lo que arregla el 2700 → 3400 del prototipo.
    expect(MS_CIERRE_ONBOARDING - MS_TAREA[3]).toBeGreaterThanOrEqual(500);
  });

  it('hay un paso de timeline por tarea, más el de "todas hechas"', () => {
    expect(MS_TAREA).toHaveLength(TAREAS_ONBOARDING.length + 1);
  });
});
