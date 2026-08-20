import { describe, expect, it } from 'vitest';
import {
  buscarEnCatalogo,
  buscarRefs,
  catalogoCurso,
  catalogoRefs,
  etiquetaModulo,
  insertarMencion,
  marcador,
  kindArchivo,
  mencionEnCursor,
  ofrecibles,
  partir,
  refUnica,
  resolverRef,
  textoPlano,
  tieneRefs,
} from './referencias';
import type { ModuloCurso, Seccion } from './types';

const mod = (id: string, nombre: string, tipo = 'assign'): ModuloCurso => ({
  id,
  nombre,
  tipo,
  url: `https://aula.test/mod/${tipo}/view.php?id=${id.slice(4)}`,
});

const SECCIONES: Seccion[] = [
  { nombre: 'Unidad 1', modulos: [mod('mod:11', 'Trabajo Práctico Nº 1')] },
  {
    nombre: 'Unidad 2',
    modulos: [
      mod('mod:21', 'Entrega Trabajo Práctico Nº 2'),
      mod('mod:22', 'Cuestionario de la Unidad 2', 'quiz'),
    ],
  },
];

describe('marcador y partir', () => {
  it('ida y vuelta', () => {
    const m = marcador({ id: 'mod:21', nombre: 'Entrega Trabajo Práctico Nº 2' });
    expect(m).toBe('[[mod:21|Entrega Trabajo Práctico Nº 2]]');
    expect(partir(m)).toEqual([
      { t: 'ref', id: 'mod:21', nombre: 'Entrega Trabajo Práctico Nº 2' },
    ]);
  });

  it('los corchetes y las barras del nombre no rompen el marcador', () => {
    const m = marcador({ id: 'mod:9', nombre: 'Guía [borrador] | v2' });
    expect(m).toBe('[[mod:9|Guía borrador v2]]');
    expect(partir(m)).toHaveLength(1);
  });

  it('parte una frase en texto y referencias, en orden', () => {
    const t = 'terminar el [[mod:21|TP Nº 2]] antes del [[sec:1|Unidad 2]] parcial';
    expect(partir(t)).toEqual([
      { t: 'texto', texto: 'terminar el ' },
      { t: 'ref', id: 'mod:21', nombre: 'TP Nº 2' },
      { t: 'texto', texto: ' antes del ' },
      { t: 'ref', id: 'sec:1', nombre: 'Unidad 2' },
      { t: 'texto', texto: ' parcial' },
    ]);
  });

  it('un texto sin marcadores es un solo trozo', () => {
    expect(partir('nada que ver')).toEqual([{ t: 'texto', texto: 'nada que ver' }]);
    expect(partir('')).toEqual([]);
    expect(tieneRefs('nada que ver')).toBe(false);
  });

  it('no confunde corchetes sueltos con un marcador', () => {
    expect(partir('[[esto no]] es una ref')).toEqual([
      { t: 'texto', texto: '[[esto no]] es una ref' },
    ]);
  });

  it('el parser no se queda con estado entre llamadas', () => {
    const t = '[[mod:11|A]] y [[mod:21|B]]';
    expect(partir(t)).toEqual(partir(t));
    expect(partir(t).filter((x) => x.t === 'ref')).toHaveLength(2);
  });
});

describe('refUnica', () => {
  it('reconoce un bloque que es solo una referencia', () => {
    expect(refUnica('  [[mod:21|TP Nº 2]]  ')).toEqual({ id: 'mod:21', nombre: 'TP Nº 2' });
  });

  it('no la reconoce si hay texto alrededor', () => {
    expect(refUnica('hacer [[mod:21|TP Nº 2]]')).toBe(null);
    expect(refUnica('[[mod:21|A]][[mod:11|B]]')).toBe(null);
    expect(refUnica('texto pelado')).toBe(null);
  });
});

describe('textoPlano', () => {
  it('deja los nombres para poder buscar', () => {
    expect(textoPlano('hacer [[mod:21|TP Nº 2]] ya')).toBe('hacer TP Nº 2 ya');
  });
});

describe('catalogoCurso', () => {
  it('lista unidades y módulos, con la unidad de cada uno', () => {
    const c = catalogoCurso(SECCIONES);
    expect(c.map((x) => x.id)).toEqual(['sec:0', 'mod:11', 'sec:1', 'mod:21', 'mod:22']);
    expect(c.find((x) => x.id === 'mod:22')).toMatchObject({
      tipo: 'modulo',
      etiqueta: 'Cuestionario',
      unidad: 'Unidad 2',
    });
    expect(c.find((x) => x.id === 'sec:1')).toMatchObject({ tipo: 'unidad', etiqueta: 'Unidad' });
  });

  it('sin secciones no hay nada que citar', () => {
    expect(catalogoCurso([])).toEqual([]);
  });
});

describe('etiquetaModulo', () => {
  it('traduce los modname conocidos y tiene default', () => {
    expect(etiquetaModulo('assign')).toBe('Tarea');
    expect(etiquetaModulo('quiz')).toBe('Cuestionario');
    expect(etiquetaModulo('loquesea')).toBe('Material');
  });
});

describe('resolverRef', () => {
  it('usa el nombre de HOY, no el cacheado', () => {
    const r = resolverRef('mod:21', 'nombre viejo', SECCIONES);
    expect(r.nombre).toBe('Entrega Trabajo Práctico Nº 2');
    expect(r.vive).toBe(true);
  });

  it('un módulo que ya no está cae al nombre cacheado', () => {
    const r = resolverRef('mod:999', 'TP que borraron', SECCIONES);
    expect(r).toMatchObject({ nombre: 'TP que borraron', vive: false, tipo: 'modulo' });
  });

  it('una unidad reordenada se encuentra por nombre', () => {
    const alReves = [...SECCIONES].reverse();
    const r = resolverRef('sec:1', 'Unidad 2', alReves);
    expect(r.id).toBe('sec:0');
    expect(r.vive).toBe(true);
  });

  it('una unidad renombrada cae al índice', () => {
    const r = resolverRef('sec:1', 'Nombre que ya no existe', SECCIONES);
    expect(r.nombre).toBe('Unidad 2');
    expect(r.vive).toBe(true);
  });
});

describe('buscarEnCatalogo', () => {
  const catalogo = catalogoCurso(SECCIONES);

  it('sin consulta devuelve todo', () => {
    expect(buscarEnCatalogo(catalogo, '  ')).toHaveLength(catalogo.length);
  });

  it('busca sin acentos ni mayúsculas', () => {
    expect(buscarEnCatalogo(catalogo, 'practico').map((x) => x.id)).toEqual([
      'mod:11',
      'mod:21',
    ]);
    expect(buscarEnCatalogo(catalogo, 'PRÁCTICO').map((x) => x.id)).toEqual(['mod:11', 'mod:21']);
  });

  it('también matchea por tipo y por unidad', () => {
    expect(buscarEnCatalogo(catalogo, 'cuestionario').map((x) => x.id)).toEqual(['mod:22']);
    expect(buscarEnCatalogo(catalogo, 'unidad 1').map((x) => x.id)).toEqual(['sec:0', 'mod:11']);
  });

  it('lo que no está no aparece', () => {
    expect(buscarEnCatalogo(catalogo, 'zzz')).toEqual([]);
  });
});

describe('mencionEnCursor', () => {
  it('agarra la palabra @ pegada al cursor', () => {
    expect(mencionEnCursor('hacer @tp', 9)).toEqual({ desde: 6, hasta: 9, consulta: 'tp' });
  });

  it('la @ recién abierta filtra con consulta vacía', () => {
    expect(mencionEnCursor('hacer @', 7)).toEqual({ desde: 6, hasta: 7, consulta: '' });
  });

  it('acepta espacios para poder escribir varias palabras', () => {
    expect(mencionEnCursor('@trabajo pra', 12)).toEqual({
      desde: 0,
      hasta: 12,
      consulta: 'trabajo pra',
    });
  });

  it('no dispara en medio de un mail', () => {
    expect(mencionEnCursor('facu@ort.edu', 12)).toBe(null);
  });

  it('un salto de línea cierra la mención', () => {
    expect(mencionEnCursor('@tp\nsegunda línea', 17)).toBe(null);
  });

  it('sin @ no hay mención', () => {
    expect(mencionEnCursor('texto pelado', 12)).toBe(null);
  });

  it('mira solo lo que está ANTES del cursor', () => {
    expect(mencionEnCursor('hacer @tp mañana', 5)).toBe(null);
  });
});

describe('insertarMencion', () => {
  it('reemplaza la mención por el marcador y deja el cursor después', () => {
    const r = insertarMencion('hacer @tp', { desde: 6, hasta: 9 }, {
      id: 'mod:21',
      nombre: 'TP Nº 2',
    });
    expect(r.texto).toBe('hacer [[mod:21|TP Nº 2]] ');
    expect(r.cursor).toBe(r.texto.length);
  });

  it('conserva lo que venía después del cursor', () => {
    const r = insertarMencion('hacer @tp antes', { desde: 6, hasta: 9 }, {
      id: 'mod:21',
      nombre: 'TP',
    });
    expect(r.texto).toBe('hacer [[mod:21|TP]]  antes');
  });
});

describe('catalogoRefs', () => {
  // Una unidad con un módulo que tiene dos archivos adjuntos: la forma real de
  // "Unidad 2 › Guía de ejercicios › TP2.pdf".
  const entrada = {
    secciones: [
      {
        nombre: 'Unidad 1',
        modulos: [
          {
            id: 'mod:10',
            nombre: 'Guía de ejercicios',
            tipo: 'resource',
            url: 'u',
            archivos: [
              { nombre: 'TP2.pdf', mime: 'application/pdf', tamano: 472000, ref: '10:0' },
              { nombre: 'anexo', mime: 'application/zip', tamano: 10, ref: '10:1' },
            ],
          },
          { id: 'mod:11', nombre: 'TP Nº 1', tipo: 'assign', url: 'u' },
        ],
      },
    ],
    materias: [
      { id: 'curso:1', nombre: 'Matemáticas', color: '#38bdf8' },
      { id: 'curso:2', nombre: 'Inglés', color: '#a78bfa' },
    ],
    materiaActualId: 'curso:1',
    avisos: [
      { id: 'assign:99', titulo: 'Entregar el TP', hecho: false, materiaId: 'curso:1' },
      { id: 'manual:1', titulo: 'Ya lo hice', hecho: true, materiaId: 'curso:1' },
      { id: 'manual:2', titulo: 'De Inglés', hecho: false, materiaId: 'curso:2' },
      { id: 'manual:3', titulo: 'General', hecho: false, materiaId: null },
    ],
  };

  it('sigue la jerarquía del aula: unidad, módulo, y sus archivos abajo', () => {
    const c = ofrecibles(catalogoRefs(entrada));
    expect(c.map((x) => x.nombre)).toEqual([
      'Unidad 1',
      'Guía de ejercicios',
      'TP2.pdf',
      'anexo',
      'TP Nº 1',
      'Entregar el TP',
    ]);
  });

  it('ofrece los ARCHIVOS del aula, no solo los módulos', () => {
    const tp2 = catalogoRefs(entrada).find((x) => x.nombre === 'TP2.pdf');
    expect(tp2?.ref).toEqual({ tipo: 'archivo', id: '10:0' });
    expect(tp2?.kind).toBe('PDF');
  });

  it('el contexto de un archivo dice unidad y módulo', () => {
    const tp2 = catalogoRefs(entrada).find((x) => x.nombre === 'TP2.pdf');
    expect(tp2?.contexto).toBe('Unidad 1 › Guía de ejercicios');
  });

  it('el contexto de un módulo es su unidad, y una unidad no tiene contexto', () => {
    const c = catalogoRefs(entrada);
    expect(c.find((x) => x.nombre === 'TP Nº 1')?.contexto).toBe('Unidad 1');
    expect(c.find((x) => x.nombre === 'Unidad 1')?.contexto).toBe('');
  });

  it('un archivo sin extensión cae al mime', () => {
    expect(catalogoRefs(entrada).find((x) => x.nombre === 'anexo')?.kind).toBe('ZIP');
  });

  it('NO ofrece otras materias, pero las deja para resolver chips viejos', () => {
    const ingles = catalogoRefs(entrada).find((x) => x.ref.id === 'curso:2');
    expect(ingles).toBeDefined();
    expect(ingles?.ofrecer).toBe(false);
    expect(ofrecibles(catalogoRefs(entrada)).some((x) => x.ref.tipo === 'materia')).toBe(false);
  });

  it('no ofrece la materia que se está editando', () => {
    expect(catalogoRefs(entrada).some((x) => x.ref.id === 'curso:1')).toBe(false);
  });

  it('solo ofrece los avisos pendientes DE ESTA materia', () => {
    const ofrecidos = ofrecibles(catalogoRefs(entrada)).filter((x) => x.ref.tipo === 'aviso');
    expect(ofrecidos.map((x) => x.ref.id)).toEqual(['assign:99']);
  });

  it('los avisos ajenos y los hechos siguen resolviendo', () => {
    const c = catalogoRefs(entrada);
    for (const id of ['manual:1', 'manual:2', 'manual:3']) {
      expect(c.find((x) => x.ref.id === id)?.ofrecer).toBe(false);
    }
  });

  it('el chip de una materia usa el color de esa materia', () => {
    const ingles = catalogoRefs(entrada).find((x) => x.ref.id === 'curso:2');
    expect(ingles?.color).toBe('#a78bfa');
  });

  it('el aviso va en rosa, y el módulo y el archivo en ámbar', () => {
    const c = catalogoRefs(entrada);
    expect(c.find((x) => x.ref.tipo === 'aviso')?.color).toBe('#fb7185');
    expect(c.find((x) => x.ref.tipo === 'modulo')?.color).toBe('#fbbf24');
    expect(c.find((x) => x.ref.tipo === 'archivo')?.color).toBe('#fbbf24');
  });

  it('sin secciones no explota', () => {
    expect(() => catalogoRefs({ ...entrada, secciones: undefined })).not.toThrow();
  });
});

describe('kindArchivo', () => {
  it('usa la extensión del nombre', () => {
    expect(kindArchivo('TP2.pdf', 'application/pdf')).toBe('PDF');
    expect(kindArchivo('Resolución final.docx', 'application/msword')).toBe('DOCX');
  });

  it('sin extensión cae a la cola del mime', () => {
    expect(kindArchivo('anexo', 'application/zip')).toBe('ZIP');
  });

  it('una "extensión" larguísima no es una extensión: gana el mime', () => {
    // "Clase 1. Sistemas de numeración" tiene un punto pero no termina en un
    // tipo de archivo, así que el tramo tras el punto se descarta.
    expect(kindArchivo('Clase 1. Sistemas de numeracion', 'application/zip')).toBe('ZIP');
  });

  it('un mime raro y larguísimo se corta, no se muestra entero', () => {
    const kind = kindArchivo('presentacion', 'application/vnd.oasis.opendocument.presentation');
    expect(kind.length).toBeLessThanOrEqual(5);
  });

  it('sin nada usable no devuelve vacío', () => {
    expect(kindArchivo('archivo raro', '')).toBe('Archivo');
  });
});

describe('buscarRefs', () => {
  const item = (
    tipo: 'archivo' | 'modulo' | 'materia' | 'aviso',
    id: string,
    nombre: string,
    kind: string,
    color: string,
    contexto = '',
    ofrecer = true
  ) => ({ ref: { tipo, id }, nombre, kind, color, contexto, ofrecer });

  const catalogo = [
    item('modulo', 'mod:1', 'Trabajo Práctico', 'Tarea', '#fbbf24', 'Unidad 2'),
    item('archivo', '1:0', 'TP2.pdf', 'PDF', '#fbbf24', 'Unidad 2 › Guía de ejercicios'),
    item('materia', 'curso:2', 'Inglés', 'materia', '#a78bfa', '', false),
    item('aviso', 'a:1', 'Parcial', 'aviso', '#fb7185'),
  ];

  it('no ofrece lo que está marcado como no ofrecible', () => {
    expect(buscarRefs(catalogo, 'INGLES', 7)).toEqual([]);
    expect(buscarRefs(catalogo, '', 7).some((x) => x.ref.tipo === 'materia')).toBe(false);
  });

  it('filtra sin acentos ni mayúsculas', () => {
    expect(buscarRefs(catalogo, 'PRACTICO', 7).map((x) => x.nombre)).toEqual(['Trabajo Práctico']);
  });

  it('también busca por el tipo', () => {
    expect(buscarRefs(catalogo, 'aviso', 7).map((x) => x.nombre)).toEqual(['Parcial']);
  });

  it('busca por el contexto: "unidad 2" trae todo lo de esa unidad', () => {
    expect(buscarRefs(catalogo, 'unidad 2', 7).map((x) => x.nombre)).toEqual([
      'Trabajo Práctico',
      'TP2.pdf',
    ]);
  });

  it('corta en el límite', () => {
    expect(buscarRefs(catalogo, '', 2)).toHaveLength(2);
  });
});
