// Portado de cursada-sync/src/logica.test.ts (node:test → vitest), más tests
// del armado del snapshot.
import { describe, expect, it } from 'vitest';
import {
  COLORES,
  archivosDesdeContenidos,
  armarSnapshot,
  avisosDesdeAssignments,
  avisosDesdeEventos,
  colorRoundRobin,
  filtrarCursosVigentes,
  nombreCortoCurso,
  type PlanMoodle,
} from './plan';

const AHORA = 1_760_000_000;

describe('filtrarCursosVigentes', () => {
  const cursos = [
    { id: 1, visible: 1, hidden: false, enddate: AHORA + 1000 }, // vigente
    { id: 2, visible: 1, hidden: false, enddate: AHORA - 1000 }, // terminado
    { id: 3, visible: 1, hidden: false, enddate: 0 }, // administrativo ("Eventos")
    { id: 4, visible: 0, hidden: false, enddate: AHORA + 1000 }, // no visible
    { id: 5, visible: 1, hidden: true, enddate: AHORA + 1000 }, // oculto
    { id: 6, visible: 1, hidden: false }, // sin enddate
  ];

  it('deja solo visibles con enddate futuro', () => {
    expect(filtrarCursosVigentes(cursos, AHORA).map((c) => c.id)).toEqual([1]);
  });

  it('los administrativos con enddate 0 quedan afuera por el mismo filtro', () => {
    expect(filtrarCursosVigentes([cursos[2]!], AHORA)).toHaveLength(0);
  });
});

describe('colorRoundRobin', () => {
  it('rota los 6 colores del handoff y vuelve a empezar', () => {
    expect(COLORES).toHaveLength(6);
    for (let i = 0; i < 12; i++) {
      expect(colorRoundRobin(i)).toBe(COLORES[i % 6]);
    }
  });

  it('continúa donde quedó: con 4 materias previas, la siguiente recibe el 5° color', () => {
    expect(colorRoundRobin(4)).toBe(COLORES[4]);
  });
});

describe('nombreCortoCurso', () => {
  it('corta en el primer " - " del nombre limpio (comillas y entidades incluidas)', () => {
    expect(nombreCortoCurso("&#039;Matemáticas - Plan 2 años 2°Semestre 2026&#039;")).toBe(
      'Matemáticas'
    );
  });

  it('sin " - " devuelve el nombre limpio entero', () => {
    expect(nombreCortoCurso('Eventos')).toBe('Eventos');
  });
});

describe('archivosDesdeContenidos', () => {
  const BASE = 'https://aula.example';

  it('resource/url/page van con id "mod:{cmid}" y URL del módulo (nunca fileurl)', () => {
    const { archivos } = archivosDesdeContenidos(
      7,
      [
        {
          modules: [
            { id: 10, name: 'Apunte 1', modname: 'resource', uservisible: true },
            { id: 11, name: 'Link &amp; más', modname: 'url', uservisible: true },
          ],
        },
      ],
      BASE
    );
    expect(archivos).toEqual([
      {
        externalId: 'mod:10',
        nombre: 'Apunte 1',
        url: `${BASE}/mod/resource/view.php?id=10`,
        cursoId: 7,
      },
      {
        externalId: 'mod:11',
        nombre: 'Link & más',
        url: `${BASE}/mod/url/view.php?id=11`,
        cursoId: 7,
      },
    ]);
  });

  it('folder: una fila por archivo, nombre "{carpeta} · {archivo}", URL al módulo', () => {
    const { archivos } = archivosDesdeContenidos(
      7,
      [
        {
          modules: [
            {
              id: 20,
              name: 'Guías',
              modname: 'folder',
              uservisible: true,
              contents: [
                { type: 'file', filename: 'guia1.pdf' },
                { type: 'file', filename: 'guia2.pdf' },
                { type: 'content', filename: 'meta' },
              ],
            },
          ],
        },
      ],
      BASE
    );
    expect(archivos.map((a) => [a.externalId, a.nombre, a.url])).toEqual([
      ['mod:20:guia1.pdf', 'Guías · guia1.pdf', `${BASE}/mod/folder/view.php?id=20`],
      ['mod:20:guia2.pdf', 'Guías · guia2.pdf', `${BASE}/mod/folder/view.php?id=20`],
    ]);
  });

  it('saltea label/forum/assign/etc. y módulos no visibles, con motivo', () => {
    const { archivos, salteados } = archivosDesdeContenidos(
      7,
      [
        {
          modules: [
            { id: 30, name: 'texto decorativo', modname: 'label', uservisible: true },
            { id: 31, name: 'TP 1', modname: 'assign', uservisible: true },
            { id: 32, name: 'Oculto', modname: 'resource', uservisible: false },
          ],
        },
      ],
      BASE
    );
    expect(archivos).toHaveLength(0);
    expect(salteados.map((s) => s.modname)).toEqual(['label', 'assign', 'resource']);
    expect(salteados[2]?.motivo).toMatch(/no visible/);
  });
});

describe('avisosDesdeAssignments', () => {
  const nombres = new Map([[7, 'Matemáticas']]);

  it('duedate en epoch SEGUNDOS → fecha YYYY-MM-DD de Buenos Aires', () => {
    const { avisos } = avisosDesdeAssignments(
      // 1/3/2026 23:00 -03 = 2/3 02:00 UTC: el día tiene que ser 01, no 02
      [{ id: 1, course: 7, name: 'TP N&uacute;mero 1', duedate: Date.UTC(2026, 2, 2, 2, 0) / 1000 }],
      nombres
    );
    expect(avisos).toHaveLength(1);
    expect(avisos[0]?.externalId).toBe('assign:1');
    expect(avisos[0]?.fecha).toBe('2026-03-01');
    expect(avisos[0]?.titulo).toBe('TP Número 1'); // pelado, sin materia
    expect(avisos[0]?.tituloConCurso).toMatch(/— Matemáticas$/);
  });

  it('duedate 0 NO genera aviso: queda descartado con motivo', () => {
    const { avisos, descartados } = avisosDesdeAssignments(
      [{ id: 2, course: 7, name: 'TP sin fecha', duedate: 0 }],
      nombres
    );
    expect(avisos).toHaveLength(0);
    expect(descartados).toHaveLength(1);
    expect(descartados[0]?.motivo).toMatch(/sin fecha/);
  });
});

describe('avisosDesdeEventos (dedupe contra assignments)', () => {
  const nombres = new Map([[7, 'Matemáticas']]);
  const vigentes = new Set([7]);

  it('descarta el evento si su assign ya generó aviso (se prefiere el assign)', () => {
    const { avisos, descartados } = avisosDesdeEventos(
      [
        {
          id: 100,
          name: 'TP 1 vence',
          timesort: AHORA,
          modulename: 'assign',
          instance: 55,
          course: { id: 7 },
        },
        {
          id: 101,
          name: 'Quiz cierra',
          timesort: AHORA,
          modulename: 'quiz',
          instance: 9,
          course: { id: 7 },
        },
      ],
      new Set([55]),
      vigentes,
      nombres
    );
    expect(avisos.map((a) => a.externalId)).toEqual(['evento:101']);
    expect(descartados).toHaveLength(1);
    expect(descartados[0]?.motivo).toMatch(/assign:55/);
  });

  it('un evento de assign SIN aviso previo (duedate 0 en el TP) sí entra', () => {
    const { avisos } = avisosDesdeEventos(
      [
        {
          id: 102,
          name: 'TP raro',
          timesort: AHORA,
          modulename: 'assign',
          instance: 99,
          course: { id: 7 },
        },
      ],
      new Set([55]),
      vigentes,
      nombres
    );
    expect(avisos.map((a) => a.externalId)).toEqual(['evento:102']);
  });

  it('descarta eventos sin curso o de cursos no vigentes', () => {
    const { avisos, descartados } = avisosDesdeEventos(
      [
        { id: 103, name: 'Evento del sitio', timesort: AHORA },
        { id: 104, name: 'Curso viejo', timesort: AHORA, course: { id: 999 } },
      ],
      new Set(),
      vigentes,
      nombres
    );
    expect(avisos).toHaveLength(0);
    expect(descartados).toHaveLength(2);
  });
});

describe('armarSnapshot', () => {
  const plan: PlanMoodle = {
    site: {
      sitename: 'Aula',
      username: 'u',
      fullname: 'Nombre Apellido',
      userid: 1,
      siteurl: 'https://aula.example',
      functions: [],
    },
    cursos: [],
    materias: [
      { externalId: 'curso:1', nombre: 'Matemáticas', cursoId: 1 },
      { externalId: 'curso:2', nombre: 'Programación', cursoId: 2 },
    ],
    archivos: [
      { externalId: 'mod:10', nombre: 'Apunte', url: 'https://aula.example/x', cursoId: 1 },
      { externalId: 'mod:11', nombre: 'Guía', url: 'https://aula.example/y', cursoId: 2 },
    ],
    modulosSalteados: [],
    avisos: [
      {
        externalId: 'assign:5',
        titulo: 'TP 1',
        tituloConCurso: 'TP 1 — Matemáticas',
        fecha: '2026-03-01',
        cursoId: 1,
      },
      {
        externalId: 'evento:9',
        titulo: 'Parcial',
        tituloConCurso: 'Parcial — Otro',
        fecha: '2026-03-05',
        cursoId: 99, // curso sin materia en el plan
      },
    ],
    avisosDescartados: [],
  };

  const snap = armarSnapshot(plan, '2026-03-01T00:00:00.000Z');

  it('arma materias con color round-robin, sin horarios ni bloques (son overlays)', () => {
    expect(snap.materias.map((m) => [m.id, m.color, m.source])).toEqual([
      ['curso:1', COLORES[0], 'moodle'],
      ['curso:2', COLORES[1], 'moodle'],
    ]);
    expect(snap.materias.every((m) => m.horarios.length === 0 && m.bloques.length === 0)).toBe(
      true
    );
    expect(snap.materias[0]?.profe).toBe('');
  });

  it('reparte los archivos por curso con materiaId', () => {
    expect(snap.materias[0]?.archivos).toEqual([
      {
        id: 'mod:10',
        materiaId: 'curso:1',
        nombre: 'Apunte',
        url: 'https://aula.example/x',
      },
    ]);
    expect(snap.materias[1]?.archivos.map((a) => a.id)).toEqual(['mod:11']);
  });

  it('avisos con título pelado, materiaId resuelto (o null) y hecho en false', () => {
    expect(snap.avisos).toEqual([
      { id: 'assign:5', materiaId: 'curso:1', titulo: 'TP 1', fecha: '2026-03-01', hecho: false },
      { id: 'evento:9', materiaId: null, titulo: 'Parcial', fecha: '2026-03-05', hecho: false },
    ]);
  });

  it('deja el `generado` que se le pasa', () => {
    expect(snap.generado).toBe('2026-03-01T00:00:00.000Z');
  });
});
