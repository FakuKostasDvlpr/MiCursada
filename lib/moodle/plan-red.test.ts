// Robustez del sync contra un aula virtual que falla a medias.
//
// El resto de plan.test.ts prueba la lógica pura con fixtures. Acá se prueba lo
// otro: qué pasa cuando Moodle contesta mal. La regla es una sola — que se
// caiga una parte NO puede dejarte sin las demás — y el caso límite también:
// si no vino NADA, el snapshot viejo no se pisa.
//
// `./cliente` se mockea entero para no tocar la red; `TokenInvalido` se toma
// del módulo real porque `construirPlan` lo distingue con `instanceof`.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MoodleError, TokenInvalido, type FuncionMoodle } from './cliente';

const llamadas: { fn: string; params: Record<string, unknown> }[] = [];

/** fn → cómo contesta Moodle. Una función que tira, tira. */
let respuestas: Partial<Record<FuncionMoodle, (params: Record<string, unknown>) => unknown>>;

vi.mock('./cliente', async (importOriginal) => {
  const real = await importOriginal<typeof import('./cliente')>();
  return {
    ...real,
    call: vi.fn(async (fn: string, params: Record<string, unknown> = {}) => {
      llamadas.push({ fn, params });
      const handler = respuestas[fn as FuncionMoodle];
      if (!handler) throw new MoodleError('nohandler', `sin respuesta mockeada para ${fn}`, fn);
      return handler(params);
    }),
  };
});

const { construirPlan, obtenerContenidoModulos } = await import('./plan');

const CRED = { token: 't', url: 'https://aula.example', userid: 1, guardadoEn: '' };

const FUTURO = Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60;

const SITE = {
  sitename: 'Instituto',
  username: 'facu',
  fullname: 'Facundo',
  userid: 1,
  siteurl: 'https://aula.example',
  functions: [],
};

/** Dos cursos vigentes: alcanza para distinguir "uno falló" de "falló todo". */
const CURSOS = [
  { id: 10, shortname: 'MAT', fullname: 'Matemáticas - Plan 2', visible: 1, enddate: FUTURO },
  { id: 20, shortname: 'PRG', fullname: 'Programación - Plan 2', visible: 1, enddate: FUTURO },
];

/** Una sección con un resource visible, para que el curso produzca un archivo. */
const contenidos = (cmid: number) => [
  {
    id: 1,
    name: 'Unidad 1',
    modules: [{ id: cmid, name: 'Apunte', modname: 'resource', uservisible: true }],
  },
];

/** Todo sale bien; cada test rompe solo lo que le interesa. */
function respuestasOk() {
  return {
    core_webservice_get_site_info: () => SITE,
    core_enrol_get_users_courses: () => CURSOS,
    core_course_get_contents: (p: Record<string, unknown>) => contenidos(Number(p.courseid) + 1),
    mod_assign_get_assignments: () => ({ courses: [] }),
    core_calendar_get_action_events_by_timesort: () => ({ events: [] }),
    mod_page_get_pages_by_courses: () => ({ pages: [] }),
    mod_url_get_urls_by_courses: () => ({ urls: [] }),
    mod_resource_get_resources_by_courses: () => ({ resources: [] }),
    mod_lesson_get_lessons_by_courses: () => ({ lessons: [] }),
    mod_quiz_get_quizzes_by_courses: () => ({ quizzes: [] }),
  } satisfies Partial<Record<FuncionMoodle, (p: Record<string, unknown>) => unknown>>;
}

beforeEach(() => {
  llamadas.length = 0;
  respuestas = respuestasOk();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('obtenerContenidoModulos: un curso no puede envenenar el lote', () => {
  it('si el lote falla, reintenta curso por curso y trae lo que se pueda', async () => {
    // El caso real: un cuestionario con Safe Exam Browser hace que
    // mod_quiz_get_quizzes_by_courses falle para los DOS cursos.
    respuestas.mod_quiz_get_quizzes_by_courses = (p) => {
      const ids = p.courseids as number[];
      if (ids.length > 1) throw new MoodleError('noconfigfilefound', 'no config', 'quiz');
      if (ids[0] === 20) throw new MoodleError('noconfigfilefound', 'no config', 'quiz');
      return { quizzes: [{ id: 5, course: 10, name: 'Parcial', intro: '<p>Hola</p>' }] };
    };

    const r = await obtenerContenidoModulos([10, 20], CRED);

    // El curso sano conserva su cuestionario en vez de perderse con el roto.
    expect(r.quizzes).toHaveLength(1);
    expect(r.quizzes[0]?.name).toBe('Parcial');

    const quiz = llamadas.filter((l) => l.fn === 'mod_quiz_get_quizzes_by_courses');
    expect(quiz).toHaveLength(3); // 1 lote + 2 individuales
  });

  it('con un solo curso no hay a quién reintentarle: devuelve vacío sin llamar de nuevo', async () => {
    respuestas.mod_quiz_get_quizzes_by_courses = () => {
      throw new MoodleError('noconfigfilefound', 'no config', 'quiz');
    };

    const r = await obtenerContenidoModulos([10], CRED);

    expect(r.quizzes).toEqual([]);
    expect(llamadas.filter((l) => l.fn === 'mod_quiz_get_quizzes_by_courses')).toHaveLength(1);
  });

  it('en el camino feliz pide UNA vez por tipo de módulo, no una por curso', async () => {
    await obtenerContenidoModulos([10, 20], CRED);
    expect(llamadas).toHaveLength(5);
  });
});

describe('construirPlan: que falle una materia no te deja sin las otras', () => {
  it('el curso roto se anota en cursosFallados y el resto del plan se arma igual', async () => {
    respuestas.core_course_get_contents = (p) => {
      if (Number(p.courseid) === 20) throw new MoodleError('nopermissions', 'sin permiso', 'c');
      return contenidos(11);
    };

    const plan = await construirPlan(CRED);

    // Las materias salen del listado de cursos, así que siguen las dos…
    expect(plan.materias.map((m) => m.cursoId)).toEqual([10, 20]);
    // …pero solo la que respondió tiene contenido.
    expect(plan.archivos.map((a) => a.cursoId)).toEqual([10]);
    expect(plan.cursosFallados).toHaveLength(1);
    expect(plan.cursosFallados[0]?.cursoId).toBe(20);
    expect(plan.cursosFallados[0]?.nombre).toBe('Programación - Plan 2');
    expect(plan.cursosFallados[0]?.motivo).toMatch(/nopermissions/);
  });

  it('si NINGÚN curso responde, tira: no se pisa el snapshot bueno con uno vacío', async () => {
    respuestas.core_course_get_contents = () => {
      throw new MoodleError('servererror', 'se cayó', 'c');
    };

    await expect(construirPlan(CRED)).rejects.toThrow(/ninguno de los 2 cursos/);
  });

  it('un token inválido NO es "un curso que falló": se propaga para re-loguear', async () => {
    respuestas.core_course_get_contents = () => {
      throw new TokenInvalido('core_course_get_contents');
    };

    await expect(construirPlan(CRED)).rejects.toBeInstanceOf(TokenInvalido);
  });

  it('sin cursos vigentes no hay nada que bajar y tampoco es un error', async () => {
    respuestas.core_enrol_get_users_courses = () => [];

    const plan = await construirPlan(CRED);

    expect(plan.materias).toEqual([]);
    expect(plan.cursosFallados).toEqual([]);
  });
});

describe('construirPlan: los avisos son un extra, no un requisito', () => {
  it('si se caen las entregas, el plan sale igual y queda anotado en degradado', async () => {
    respuestas.mod_assign_get_assignments = () => {
      throw new MoodleError('servererror', 'se cayó', 'a');
    };

    const plan = await construirPlan(CRED);

    expect(plan.materias).toHaveLength(2);
    expect(plan.degradado).toContain('entregas');
  });

  it('si se cae el calendario, ídem', async () => {
    respuestas.core_calendar_get_action_events_by_timesort = () => {
      throw new MoodleError('servererror', 'se cayó', 'e');
    };

    const plan = await construirPlan(CRED);

    expect(plan.materias).toHaveLength(2);
    expect(plan.degradado).toContain('calendario');
  });

  it('con todo sano, degradado y cursosFallados quedan vacíos', async () => {
    const plan = await construirPlan(CRED);

    expect(plan.degradado).toEqual([]);
    expect(plan.cursosFallados).toEqual([]);
    expect(plan.archivos.map((a) => a.cursoId)).toEqual([10, 20]);
  });
});
