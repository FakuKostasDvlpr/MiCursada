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
  contenidosPorModulo,
  finalizacionDeModulo,
  requisitosDeModulo,
  seccionesDesdeContenidos,
  urlAsistenciaDesdeContenidos,
  urlClaseDesdeContenidos,
  type PlanMoodle,
} from './plan';
import type { RefArchivo } from './contenido';

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
    refsArchivos: {},
    cursosFallados: [],
    degradado: [],
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

describe('urlAsistenciaDesdeContenidos', () => {
  const BASE = 'https://aula.example';

  it('devuelve la URL del módulo attendance visible', () => {
    expect(
      urlAsistenciaDesdeContenidos(
        [
          {
            modules: [
              { id: 10, name: 'Apunte', modname: 'resource', uservisible: true },
              { id: 143071, name: 'Asistencia', modname: 'attendance', uservisible: true },
            ],
          },
        ],
        BASE
      )
    ).toBe(`${BASE}/mod/attendance/view.php?id=143071`);
  });

  it('ignora el attendance no visible para el alumno', () => {
    expect(
      urlAsistenciaDesdeContenidos(
        [{ modules: [{ id: 1, name: 'Asistencia', modname: 'attendance', uservisible: false }] }],
        BASE
      )
    ).toBeNull();
  });

  it('null si el curso no tiene módulo de asistencia', () => {
    expect(
      urlAsistenciaDesdeContenidos(
        [{ modules: [{ id: 1, name: 'Apunte', modname: 'resource', uservisible: true }] }],
        BASE
      )
    ).toBeNull();
  });

  it('el attendance se sigue salteando como archivo', () => {
    const { archivos, salteados } = archivosDesdeContenidos(
      7,
      [{ modules: [{ id: 143071, name: 'Asistencia', modname: 'attendance', uservisible: true }] }],
      BASE
    );
    expect(archivos).toEqual([]);
    expect(salteados[0]?.modname).toBe('attendance');
  });
});

describe('urlClaseDesdeContenidos', () => {
  const BASE = 'https://aula.example';
  const sala = (id: number, name: string, uservisible = true) => ({
    id,
    name,
    modname: 'zoom',
    uservisible,
  });

  it('devuelve la URL de la sala de cursada de la comisión', () => {
    expect(
      urlClaseDesdeContenidos(
        [
          {
            modules: [
              { id: 10, name: 'Apunte', modname: 'resource', uservisible: true },
              sala(144695, 'Clases Organización Empresarial [asc-ya-11a]'),
            ],
          },
        ],
        BASE
      )
    ).toBe(`${BASE}/mod/zoom/view.php?id=144695`);
  });

  it('prefiere la sala de cursada por sobre la de recuperatorio', () => {
    expect(
      urlClaseDesdeContenidos(
        [
          {
            modules: [
              sala(143226, 'Recuperatorio Fundamentos de Programación'),
              sala(143242, 'Clases Fundamentos de Programación [asc-ya-11a]'),
            ],
          },
        ],
        BASE
      )
    ).toBe(`${BASE}/mod/zoom/view.php?id=143242`);
  });

  it('null si solo hay salas de recuperatorio/examen', () => {
    expect(
      urlClaseDesdeContenidos(
        [
          {
            modules: [
              sala(1, 'Recuperatorio del 2° parcial'),
              sala(2, 'Examen final Matemáticas'),
            ],
          },
        ],
        BASE
      )
    ).toBeNull();
  });

  it('null si el curso no tiene módulo zoom', () => {
    expect(
      urlClaseDesdeContenidos(
        [{ modules: [{ id: 1, name: 'Apunte', modname: 'resource', uservisible: true }] }],
        BASE
      )
    ).toBeNull();
  });

  it('ignora la sala no visible para el alumno', () => {
    expect(
      urlClaseDesdeContenidos(
        [{ modules: [sala(1, 'Clases [asc-ya-11a]', false)] }],
        BASE
      )
    ).toBeNull();
  });

  it('el zoom se sigue salteando como archivo', () => {
    const { archivos, salteados } = archivosDesdeContenidos(
      7,
      [{ modules: [sala(143242, 'Clases [asc-ya-11a]')] }],
      BASE
    );
    expect(archivos).toEqual([]);
    expect(salteados[0]?.modname).toBe('zoom');
  });
});

describe('armarSnapshot con asistencia', () => {
  const planBase: PlanMoodle = {
    site: { fullname: 'Alumno', sitename: 'Aula', userid: 1 } as PlanMoodle['site'],
    cursos: [],
    materias: [
      {
        externalId: 'curso:1',
        nombre: 'Con asistencia',
        cursoId: 1,
        asistenciaUrl: 'https://a/x',
        claseUrl: 'https://a/z',
      },
      { externalId: 'curso:2', nombre: 'Sin asistencia', cursoId: 2 },
    ],
    archivos: [],
    modulosSalteados: [],
    avisos: [],
    avisosDescartados: [],
    refsArchivos: {},
    cursosFallados: [],
    degradado: [],
  };

  it('copia asistenciaUrl solo en las materias que la tienen', () => {
    const snap = armarSnapshot(planBase, '2026-08-16T00:00:00.000Z');
    expect(snap.materias[0]?.asistenciaUrl).toBe('https://a/x');
    expect(snap.materias[1]).not.toHaveProperty('asistenciaUrl');
  });

  it('copia claseUrl solo en las materias que la tienen', () => {
    const snap = armarSnapshot(planBase, '2026-08-16T00:00:00.000Z');
    expect(snap.materias[0]?.claseUrl).toBe('https://a/z');
    expect(snap.materias[1]).not.toHaveProperty('claseUrl');
  });
});

describe('seccionesDesdeContenidos', () => {
  const BASE = 'https://aula.example';

  it('arma unidades con sus módulos y la URL del módulo (nunca fileurl)', () => {
    const secciones = seccionesDesdeContenidos(
      [
        {
          name: 'Unidad 1',
          modules: [
            { id: 10, name: 'Apunte de modularización', modname: 'resource' },
            { id: 11, name: 'TP 1', modname: 'assign' },
          ],
        },
      ],
      BASE
    );
    expect(secciones).toEqual([
      {
        nombre: 'Unidad 1',
        modulos: [
          {
            id: 'mod:10',
            nombre: 'Apunte de modularización',
            tipo: 'resource',
            url: `${BASE}/mod/resource/view.php?id=10`,
          },
          {
            id: 'mod:11',
            nombre: 'TP 1',
            tipo: 'assign',
            url: `${BASE}/mod/assign/view.php?id=11`,
          },
        ],
      },
    ]);
  });

  it('saltea la sección que el alumno no ve', () => {
    expect(
      seccionesDesdeContenidos(
        [
          {
            name: 'Borrador del profe',
            uservisible: false,
            modules: [{ id: 1, name: 'Apunte', modname: 'resource' }],
          },
        ],
        BASE
      )
    ).toEqual([]);
  });

  it('saltea el módulo con uservisible false', () => {
    const secciones = seccionesDesdeContenidos(
      [
        {
          name: 'Unidad 2',
          modules: [
            { id: 1, name: 'Oculto', modname: 'resource', uservisible: false },
            { id: 2, name: 'Visible', modname: 'page', uservisible: true },
          ],
        },
      ],
      BASE
    );
    expect(secciones[0]?.modulos.map((m) => m.nombre)).toEqual(['Visible']);
  });

  it('saltea label, attendance y zoom (decorativos o con botón propio)', () => {
    const secciones = seccionesDesdeContenidos(
      [
        {
          name: 'Unidad 3',
          modules: [
            { id: 1, name: 'Texto suelto', modname: 'label' },
            { id: 2, name: 'Asistencia', modname: 'attendance' },
            { id: 3, name: 'Clase por Zoom', modname: 'zoom' },
            { id: 4, name: 'Guía', modname: 'resource' },
          ],
        },
      ],
      BASE
    );
    expect(secciones[0]?.modulos.map((m) => m.tipo)).toEqual(['resource']);
  });

  it('la sección que queda sin módulos no aparece', () => {
    expect(
      seccionesDesdeContenidos(
        [
          { name: 'Solo carteles', modules: [{ id: 1, name: 'Bienvenidos', modname: 'label' }] },
          { name: 'Sin nada', modules: [] },
        ],
        BASE
      )
    ).toEqual([]);
  });

  it('la descripción HTML se guarda como texto plano', () => {
    const secciones = seccionesDesdeContenidos(
      [
        {
          name: 'Unidad 1 - Extensión',
          modules: [
            {
              id: 5,
              name: 'Modularización',
              modname: 'page',
              description: '<p>Aqu&iacute; te mostramos algunos <b>conceptos</b> b&aacute;sicos.</p>',
            },
          ],
        },
      ],
      BASE
    );
    expect(secciones[0]?.modulos[0]?.descripcion).toBe(
      'Aquí te mostramos algunos conceptos básicos.'
    );
  });

  it('la descripción vacía o igual al nombre se omite', () => {
    const secciones = seccionesDesdeContenidos(
      [
        {
          name: 'Unidad 1',
          modules: [
            { id: 1, name: 'Guía', modname: 'resource', description: '<p>&nbsp;</p>' },
            { id: 2, name: 'Parcial', modname: 'quiz', description: '<p>Parcial</p>' },
          ],
        },
      ],
      BASE
    );
    expect(secciones[0]?.modulos[0]).not.toHaveProperty('descripcion');
    expect(secciones[0]?.modulos[1]).not.toHaveProperty('descripcion');
  });

  it('recorta las descripciones largas con elipsis', () => {
    const larga = 'palabra '.repeat(120).trim();
    const secciones = seccionesDesdeContenidos(
      [{ name: 'U1', modules: [{ id: 1, name: 'X', modname: 'page', description: larga }] }],
      BASE
    );
    const d = secciones[0]?.modulos[0]?.descripcion ?? '';
    expect(d.length).toBeLessThanOrEqual(401);
    expect(d.endsWith('…')).toBe(true);
  });

  it('el snapshot solo lleva `secciones` si la materia tiene contenido', () => {
    const plan: PlanMoodle = {
      site: { sitename: 's', username: 'u', fullname: 'F', userid: 1, siteurl: 'https://a', functions: [] },
      cursos: [],
      materias: [
        {
          externalId: 'curso:1',
          nombre: 'Con contenido',
          cursoId: 1,
          secciones: [
            { nombre: 'Unidad 1', modulos: [{ id: 'mod:9', nombre: 'Guía', tipo: 'resource', url: 'https://a/g' }] },
          ],
        },
        { externalId: 'curso:2', nombre: 'Sin contenido', cursoId: 2 },
      ],
      archivos: [],
      modulosSalteados: [],
      avisos: [],
      avisosDescartados: [],
      refsArchivos: {},
    cursosFallados: [],
    degradado: [],
    };
    const snap = armarSnapshot(plan, '2026-08-16T00:00:00.000Z');
    expect(snap.materias[0]?.secciones?.[0]?.nombre).toBe('Unidad 1');
    expect(snap.materias[1]).not.toHaveProperty('secciones');
  });
});

// ─── lector embebido: contenido de los módulos dentro de la app ──────────────

describe('contenidosPorModulo', () => {
  const vacios = { pages: [], urls: [], resources: [], lessons: [], quizzes: [], assignments: [] };

  it('page: usa `content` (el HTML completo) y detecta el video de YouTube', () => {
    const refs: Record<string, RefArchivo> = {};
    const mapa = contenidosPorModulo(
      {
        ...vacios,
        pages: [
          {
            id: 1,
            coursemodule: 500,
            course: 7,
            name: 'Recurso Externo 1',
            intro: '<p>intro corta</p>',
            content:
              '<p>Mirá este video</p><iframe src="https://www.youtube.com/embed/TMeaRPvj_rA?rel=0"></iframe>',
          },
        ],
      },
      [],
      refs
    );
    const c = mapa.get(500);
    expect(c?.html).toContain('Mirá este video');
    expect(c?.html).toContain('youtube-nocookie.com/embed/TMeaRPvj_rA');
    expect(c?.video).toBe('TMeaRPvj_rA');
  });

  it('url: guarda el externalurl como enlace y saca la lista de YouTube', () => {
    const mapa = contenidosPorModulo(
      {
        ...vacios,
        urls: [
          {
            id: 2,
            coursemodule: 501,
            course: 7,
            name: 'Playlist',
            intro: '<p>toda la teoría</p>',
            externalurl: 'https://www.youtube.com/playlist?list=PLabc123DEF',
          },
        ],
      },
      [],
      {}
    );
    const c = mapa.get(501);
    expect(c?.enlace).toBe('https://www.youtube.com/playlist?list=PLabc123DEF');
    expect(c?.video).toBe('lista:PLabc123DEF');
    expect(c?.html).toContain('toda la teoría');
  });

  it('assign: consigna + adjuntos, con ref opaca y SIN el token en ningún lado', () => {
    const refs: Record<string, RefArchivo> = {};
    const mapa = contenidosPorModulo(
      {
        ...vacios,
        assignments: [
          {
            id: 3,
            cmid: 4321,
            course: 7,
            name: 'Trabajo Práctico Nº 1',
            duedate: 0,
            intro: '<p>Resolver los ejercicios.</p>',
            introattachments: [
              {
                filename: '2022C2-ORT-FPROG-TP1.pdf',
                filesize: 164_864,
                mimetype: 'application/pdf',
                fileurl:
                  'https://aula.test/webservice/pluginfile.php/1/mod_assign/introattachment/0/2022C2-ORT-FPROG-TP1.pdf?token=SECRETO',
              },
            ],
          },
        ],
      },
      [],
      refs
    );
    const c = mapa.get(4321);
    expect(c?.archivos).toEqual([
      {
        nombre: '2022C2-ORT-FPROG-TP1.pdf',
        mime: 'application/pdf',
        tamano: 164_864,
        ref: '4321:0',
      },
    ]);
    // Lo que va al snapshot no tiene URL ni token; la URL vive solo en el índice.
    expect(JSON.stringify(c)).not.toMatch(/token|pluginfile|SECRETO/);
    expect(refs['4321:0']?.url).toContain('pluginfile.php');
    expect(JSON.stringify(refs)).not.toMatch(/SECRETO|token=/);
  });

  it('resource: los contentfiles quedan como archivos descargables', () => {
    const mapa = contenidosPorModulo(
      {
        ...vacios,
        resources: [
          {
            id: 4,
            coursemodule: 600,
            course: 7,
            name: 'Apunte',
            contentfiles: [
              {
                filename: 'apunte.pdf',
                filesize: 205_824,
                mimetype: 'application/pdf',
                fileurl: 'https://aula.test/webservice/pluginfile.php/1/mod_resource/content/1/apunte.pdf?token=X',
              },
            ],
          },
        ],
      },
      [],
      {}
    );
    expect(mapa.get(600)?.archivos?.[0]?.ref).toBe('600:0');
  });

  it('un módulo sin nada embebible no entra en el mapa', () => {
    const mapa = contenidosPorModulo(
      { ...vacios, quizzes: [{ id: 5, coursemodule: 700, course: 7, name: 'Quiz', intro: '' }] },
      [],
      {}
    );
    expect(mapa.has(700)).toBe(false);
  });

  it('folder: los archivos salen de contents[] de core_course_get_contents', () => {
    const mapa = contenidosPorModulo(
      vacios,
      [
        {
          modules: [
            {
              id: 800,
              name: 'Guías',
              modname: 'folder',
              contents: [
                {
                  type: 'file',
                  filename: 'guia1.pdf',
                  filesize: 1024,
                  mimetype: 'application/pdf',
                  fileurl: 'https://aula.test/webservice/pluginfile.php/1/mod_folder/content/0/guia1.pdf?token=X',
                },
              ],
            },
          ],
        },
      ],
      {}
    );
    expect(mapa.get(800)?.archivos?.map((a) => a.nombre)).toEqual(['guia1.pdf']);
  });
});

describe('seccionesDesdeContenidos con contenido embebible', () => {
  it('pega el html/video/archivos al módulo por cmid', () => {
    const contenidos = new Map([
      [10, { html: '<p>hola</p>', video: 'TMeaRPvj_rA' }],
    ]);
    const salida = seccionesDesdeContenidos(
      [
        {
          name: 'Unidad 1',
          modules: [
            { id: 10, name: 'Video', modname: 'page', uservisible: true },
            { id: 11, name: 'Otro', modname: 'resource', uservisible: true },
          ],
        },
      ],
      'https://aula.test',
      contenidos
    );
    expect(salida[0]?.modulos[0]?.html).toBe('<p>hola</p>');
    expect(salida[0]?.modulos[0]?.video).toBe('TMeaRPvj_rA');
    // El que no tiene contenido sigue con su link al aula virtual y nada más.
    expect(salida[0]?.modulos[1]?.html).toBeUndefined();
    expect(salida[0]?.modulos[1]?.url).toBe('https://aula.test/mod/resource/view.php?id=11');
  });
});

describe('finalizacionDeModulo (lo que ya hiciste en el aula)', () => {
  const mod = (completiondata?: unknown) =>
    ({ id: 1, name: 'X', modname: 'resource', ...(completiondata ? { completiondata } : {}) }) as
      Parameters<typeof finalizacionDeModulo>[0];

  it('state 0 es pendiente', () => {
    expect(finalizacionDeModulo(mod({ state: 0, hascompletion: true, istrackeduser: true }))).toBe(
      false
    );
  });

  it('state 1, 2 y 3 cuentan como hecho (2 = aprobado, 3 = desaprobado pero HECHO)', () => {
    for (const state of [1, 2, 3]) {
      expect(
        finalizacionDeModulo(mod({ state, hascompletion: true, istrackeduser: true }))
      ).toBe(true);
    }
  });

  it('sin completiondata devuelve undefined, no false', () => {
    // Es la diferencia entre "no tiene seguimiento" y "lo tenés pendiente":
    // con false la UI pintaría un pendiente que el profe nunca configuró.
    expect(finalizacionDeModulo(mod())).toBeUndefined();
  });

  it('hascompletion false o istrackeduser false → undefined', () => {
    expect(finalizacionDeModulo(mod({ state: 0, hascompletion: false }))).toBeUndefined();
    expect(finalizacionDeModulo(mod({ state: 0, istrackeduser: false }))).toBeUndefined();
  });
});

describe('seccionesDesdeContenidos con finalización', () => {
  it('copia `hecho` al módulo del snapshot, y lo omite si no hay seguimiento', () => {
    const secs = seccionesDesdeContenidos(
      [
        {
          name: 'Unidad 1',
          modules: [
            {
              id: 1,
              name: 'Visto',
              modname: 'resource',
              uservisible: true,
              completiondata: { state: 1, hascompletion: true, istrackeduser: true },
            },
            {
              id: 2,
              name: 'Pendiente',
              modname: 'resource',
              uservisible: true,
              completiondata: { state: 0, hascompletion: true, istrackeduser: true },
            },
            { id: 3, name: 'Sin seguimiento', modname: 'resource', uservisible: true },
          ],
        },
      ],
      'https://aula.example'
    );

    expect(secs[0]?.modulos.map((m) => m.hecho)).toEqual([true, false, undefined]);
  });
});

describe('requisitosDeModulo (las condiciones que muestra el aula)', () => {
  const con = (details: unknown) =>
    ({
      id: 1,
      name: 'X',
      modname: 'assign',
      completiondata: { state: 0, hascompletion: true, istrackeduser: true, details },
    }) as Parameters<typeof requisitosDeModulo>[0];

  it('usa el texto de Moodle tal cual y marca cuál está cumplida', () => {
    // Caso real del TP Nº3: pide ver el enunciado Y entregar.
    expect(
      requisitosDeModulo(
        con([
          { rulename: 'completionview', rulevalue: { status: 1, description: 'Ver' } },
          { rulename: 'completionsubmit', rulevalue: { status: 0, description: 'Hacer un envío' } },
        ])
      )
    ).toEqual([
      { texto: 'Ver', cumplido: true },
      { texto: 'Hacer un envío', cumplido: false },
    ]);
  });

  it('decodifica entidades HTML del texto', () => {
    expect(
      requisitosDeModulo(
        con([{ rulevalue: { status: 0, description: 'Recibir una calificaci&oacute;n' } }])
      )
    ).toEqual([{ texto: 'Recibir una calificación', cumplido: false }]);
  });

  it('descarta las condiciones sin texto en vez de mostrar una vacía', () => {
    expect(requisitosDeModulo(con([{ rulevalue: { status: 1 } }, {}]))).toEqual([]);
  });

  it('sin completiondata no hay requisitos', () => {
    expect(
      requisitosDeModulo({ id: 1, name: 'X', modname: 'resource' } as Parameters<
        typeof requisitosDeModulo
      >[0])
    ).toEqual([]);
  });
});
