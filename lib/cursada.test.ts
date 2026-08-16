import { describe, it, expect } from 'vitest';
import { fromZonedTime } from 'date-fns-tz';
import type { Aviso, Materia, Horario, Dia, ColorMateria } from '@/lib/types';
import {
  proximaClase,
  textoEstado,
  clasesDeHoy,
  statsBento,
  semana,
  estadoAviso,
  iniciales,
  fechaLargaHoy,
  hace,
  estadoAsistencia,
  MIN_ANTES_ASISTENCIA,
} from '@/lib/cursada';

const TZ = 'America/Argentina/Buenos_Aires';

/** Construye un Date UTC a partir de hora de pared de Buenos Aires. */
const ba = (s: string) => fromZonedTime(s, TZ);

let seq = 0;
const horario = (dia: Dia, inicio: string, fin: string): Horario => ({
  id: `h${++seq}`,
  materiaId: 'x',
  dia,
  inicio,
  fin,
});

const mat = (nombre: string, horarios: Horario[], color: ColorMateria = '#38bdf8'): Materia => ({
  id: `m-${nombre}`,
  nombre,
  profe: '',
  aula: '',
  color,
  source: 'moodle',
  horarios,
  bloques: [],
  archivos: [],
});

const aviso = (fecha: string, hecho = false): Aviso => ({
  id: `a${++seq}`,
  materiaId: null,
  titulo: 'Aviso',
  fecha,
  hecho,
});

// Semana de referencia (2026): Lun 10/08 … Sáb 15/08, Dom 16/08.
const JUEVES = '2026-08-13';

const analisis = () => mat('Análisis', [horario(1, '18:10', '19:40'), horario(4, '19:50', '21:30')]);
const bases = () => mat('Bases', [horario(4, '18:10', '19:40'), horario(5, '18:10', '19:40')]);

describe('proximaClase', () => {
  it('detecta la clase en curso como próxima con enCurso=true', () => {
    const prox = proximaClase([bases()], ba(`${JUEVES} 18:30`));
    expect(prox).not.toBeNull();
    expect(prox!.materia.nombre).toBe('Bases');
    expect(prox!.horario.inicio).toBe('18:10');
    expect(prox!.offsetDias).toBe(0);
    expect(prox!.enCurso).toBe(true);
  });

  it('saltea la clase de hoy ya terminada y pasa a la siguiente del día', () => {
    // Jueves 19:45: Bases (18:10–19:40) terminó, Análisis (19:50–21:30) viene después.
    const prox = proximaClase([analisis(), bases()], ba(`${JUEVES} 19:45`));
    expect(prox!.materia.nombre).toBe('Análisis');
    expect(prox!.horario.inicio).toBe('19:50');
    expect(prox!.offsetDias).toBe(0);
    expect(prox!.enCurso).toBe(false);
  });

  it('una clase que termina exactamente ahora no cuenta como próxima', () => {
    const prox = proximaClase([bases()], ba(`${JUEVES} 19:40`));
    // Bases jueves terminó (fin <= ahora); la próxima es Bases del viernes.
    expect(prox!.offsetDias).toBe(1);
    expect(prox!.horario.dia).toBe(5);
  });

  it('desde el domingo salta al lunes con offsetDias=1', () => {
    const prox = proximaClase([analisis()], ba('2026-08-16 12:00'));
    expect(prox!.horario.dia).toBe(1);
    expect(prox!.horario.inicio).toBe('18:10');
    expect(prox!.offsetDias).toBe(1);
    expect(prox!.enCurso).toBe(false);
  });

  it('devuelve null si no hay ninguna clase en la semana', () => {
    expect(proximaClase([], ba(`${JUEVES} 12:00`))).toBeNull();
    expect(proximaClase([mat('Sin horarios', [])], ba(`${JUEVES} 12:00`))).toBeNull();
  });

  it('empata por el horario más temprano del día', () => {
    const tarde = mat('Tarde', [horario(4, '19:50', '21:30')]);
    const temprano = mat('Temprano', [horario(4, '18:10', '19:40')]);
    const prox = proximaClase([tarde, temprano], ba(`${JUEVES} 10:00`));
    expect(prox!.materia.nombre).toBe('Temprano');
  });

  it('borde de medianoche: 23:50 con clase mañana da offsetDias=1', () => {
    // Jueves 23:50 (BA); en UTC ya es viernes — no debe confundirse.
    const prox = proximaClase([bases()], ba(`${JUEVES} 23:50`));
    expect(prox!.offsetDias).toBe(1);
    expect(prox!.horario.dia).toBe(5);
  });
});

describe('textoEstado', () => {
  it('en curso muestra la hora de fin', () => {
    const prox = proximaClase([bases()], ba(`${JUEVES} 18:30`))!;
    expect(textoEstado(prox, ba(`${JUEVES} 18:30`))).toBe('En curso — termina 19:40');
  });

  it('hoy futura con >= 1 h usa "h" y "min"', () => {
    const prox = proximaClase([bases()], ba(`${JUEVES} 16:50`))!;
    expect(textoEstado(prox, ba(`${JUEVES} 16:50`))).toBe('Empieza en 1 h 20 min');
  });

  it('hoy futura con horas exactas omite los minutos', () => {
    const prox = proximaClase([bases()], ba(`${JUEVES} 16:10`))!;
    expect(textoEstado(prox, ba(`${JUEVES} 16:10`))).toBe('Empieza en 2 h');
  });

  it('hoy futura con < 1 h usa solo minutos', () => {
    const prox = proximaClase([bases()], ba(`${JUEVES} 17:25`))!;
    expect(textoEstado(prox, ba(`${JUEVES} 17:25`))).toBe('Empieza en 45 min');
  });

  it('offsetDias 1 dice "Mañana a las"', () => {
    const ahora = ba('2026-08-16 12:00'); // domingo
    const prox = proximaClase([analisis()], ahora)!;
    expect(textoEstado(prox, ahora)).toBe('Mañana a las 18:10');
  });

  it('offsetDias >= 2 dice "El <día> a las" en minúscula', () => {
    const ahora = ba('2026-08-15 12:00'); // sábado; próxima: lunes
    const prox = proximaClase([analisis()], ahora)!;
    expect(prox.offsetDias).toBe(2);
    expect(textoEstado(prox, ahora)).toBe('El lunes a las 18:10');
  });

  it('días con tilde salen bien (miércoles)', () => {
    const ahora = ba('2026-08-10 22:00'); // lunes a la noche, clase el miércoles
    const ingles = mat('Inglés', [horario(3, '19:00', '21:00')]);
    const prox = proximaClase([ingles], ahora)!;
    expect(textoEstado(prox, ahora)).toBe('El miércoles a las 19:00');
  });
});

describe('clasesDeHoy', () => {
  it('devuelve las clases del día ordenadas por inicio con flags', () => {
    const clases = clasesDeHoy([analisis(), bases()], ba(`${JUEVES} 18:30`));
    expect(clases.map((c) => c.horario.inicio)).toEqual(['18:10', '19:50']);
    expect(clases[0]!.enCurso).toBe(true);
    expect(clases[0]!.pasada).toBe(false);
    expect(clases[1]!.enCurso).toBe(false);
    expect(clases[1]!.pasada).toBe(false);
  });

  it('marca pasada cuando fin <= ahora', () => {
    const clases = clasesDeHoy([analisis(), bases()], ba(`${JUEVES} 21:30`));
    expect(clases.map((c) => c.pasada)).toEqual([true, true]);
    expect(clases.map((c) => c.enCurso)).toEqual([false, false]);
  });

  it('domingo no tiene clases', () => {
    expect(clasesDeHoy([analisis(), bases()], ba('2026-08-16 18:30'))).toEqual([]);
  });
});

describe('statsBento', () => {
  const ms = () => [analisis(), bases()]; // jueves: 18:10–19:40 y 19:50–21:30

  it('día libre cuando no hay clases hoy', () => {
    const s = statsBento([analisis()], [], ba('2026-08-12 12:00')); // miércoles
    expect(s.clasesHoy).toBe(0);
    expect(s.subClases).toBe('día libre');
  });

  it('todas por delante cuando ninguna empezó', () => {
    const s = statsBento(ms(), [], ba(`${JUEVES} 10:00`));
    expect(s.clasesHoy).toBe(2);
    expect(s.subClases).toBe('todas por delante');
  });

  it('quedan 2 con una en curso y otra por venir', () => {
    const s = statsBento(ms(), [], ba(`${JUEVES} 18:30`));
    expect(s.subClases).toBe('quedan 2');
  });

  it('queda 1 en singular', () => {
    const s = statsBento(ms(), [], ba(`${JUEVES} 19:45`));
    expect(s.subClases).toBe('queda 1');
  });

  it('ya terminaste cuando todas terminaron', () => {
    const s = statsBento(ms(), [], ba(`${JUEVES} 22:00`));
    expect(s.subClases).toBe('ya terminaste');
  });

  it('al día sin pendientes (los hechos no cuentan)', () => {
    const s = statsBento([], [aviso('2026-08-01', true)], ba(`${JUEVES} 12:00`));
    expect(s.pendientes).toBe(0);
    expect(s.vencidos).toBe(0);
    expect(s.subPendientes).toBe('al día');
  });

  it('cuenta vencidos en plural', () => {
    const avisos = [aviso('2026-08-10'), aviso('2026-08-12'), aviso('2026-08-20')];
    const s = statsBento([], avisos, ba(`${JUEVES} 12:00`));
    expect(s.pendientes).toBe(3);
    expect(s.vencidos).toBe(2);
    expect(s.subPendientes).toBe('2 vencidos');
  });

  it('1 vencido en singular', () => {
    const s = statsBento([], [aviso('2026-08-12')], ba(`${JUEVES} 12:00`));
    expect(s.subPendientes).toBe('1 vencido');
  });

  it('nada vencido con pendientes futuros o de hoy', () => {
    const s = statsBento([], [aviso(JUEVES), aviso('2026-08-20')], ba(`${JUEVES} 12:00`));
    expect(s.pendientes).toBe(2);
    expect(s.vencidos).toBe(0);
    expect(s.subPendientes).toBe('nada vencido');
  });
});

describe('semana', () => {
  it('arma Lunes–Sábado de la semana actual con esHoy', () => {
    const s = semana(ba(`${JUEVES} 12:00`));
    expect(s.dias).toHaveLength(6);
    expect(s.dias.map((d) => d.nombre)).toEqual([
      'Lunes',
      'Martes',
      'Miércoles',
      'Jueves',
      'Viernes',
      'Sábado',
    ]);
    expect(s.dias.map((d) => d.fecha)).toEqual([
      '10/08',
      '11/08',
      '12/08',
      '13/08',
      '14/08',
      '15/08',
    ]);
    expect(s.dias.map((d) => d.esHoy)).toEqual([false, false, false, true, false, false]);
    expect(s.rango).toBe('10/08 – 15/08');
  });

  it('si hoy es domingo muestra la semana que arranca mañana, sin esHoy', () => {
    const s = semana(ba('2026-08-16 12:00'));
    expect(s.dias.map((d) => d.fecha)).toEqual([
      '17/08',
      '18/08',
      '19/08',
      '20/08',
      '21/08',
      '22/08',
    ]);
    expect(s.dias.every((d) => !d.esHoy)).toBe(true);
    expect(s.rango).toBe('17/08 – 22/08');
  });

  it('cruza fin de mes con dd/MM correcto', () => {
    const s = semana(ba('2026-08-31 12:00')); // lunes 31/08
    expect(s.dias[0]!.fecha).toBe('31/08');
    expect(s.dias[1]!.fecha).toBe('01/09');
    expect(s.rango).toBe('31/08 – 05/09');
  });

  it('a las 23:50 BA sigue siendo el día local aunque en UTC ya sea mañana', () => {
    const s = semana(ba(`${JUEVES} 23:50`));
    expect(s.dias[3]!.esHoy).toBe(true);
    expect(s.rango).toBe('10/08 – 15/08');
  });
});

describe('estadoAviso', () => {
  it('hecho gana siempre', () => {
    expect(estadoAviso(aviso('2026-08-10', true), ba(`${JUEVES} 12:00`))).toBe('hecho');
  });

  it('fecha anterior a hoy es vencido', () => {
    expect(estadoAviso(aviso('2026-08-12'), ba(`${JUEVES} 12:00`))).toBe('vencido');
  });

  it('un aviso de hoy a las 23:59 BA NO está vencido', () => {
    expect(estadoAviso(aviso(JUEVES), ba(`${JUEVES} 23:59`))).toBe('hoy');
  });

  it('a las 00:30 BA el aviso de ayer ya venció', () => {
    expect(estadoAviso(aviso(JUEVES), ba('2026-08-14 00:30'))).toBe('vencido');
  });

  it('fecha futura es pendiente', () => {
    expect(estadoAviso(aviso('2026-08-20'), ba(`${JUEVES} 12:00`))).toBe('pendiente');
  });
});

describe('iniciales', () => {
  it('dos palabras dan dos iniciales en mayúscula', () => {
    expect(iniciales('Facundo Costas')).toBe('FC');
  });

  it('una palabra da una inicial', () => {
    expect(iniciales('Facundo')).toBe('F');
  });

  it('string vacío o espacios da vacío', () => {
    expect(iniciales('')).toBe('');
    expect(iniciales('   ')).toBe('');
  });

  it('más de dos palabras usa solo las primeras dos', () => {
    expect(iniciales('facundo costas tealdi')).toBe('FC');
  });
});

describe('fechaLargaHoy', () => {
  it('formatea "Jueves 13 de agosto"', () => {
    expect(fechaLargaHoy(ba(`${JUEVES} 12:00`))).toBe('Jueves 13 de agosto');
  });

  it('usa el día local BA en el borde de medianoche', () => {
    expect(fechaLargaHoy(ba(`${JUEVES} 23:50`))).toBe('Jueves 13 de agosto');
    expect(fechaLargaHoy(ba('2026-08-16 00:10'))).toBe('Domingo 16 de agosto');
  });
});

describe('hace', () => {
  const AHORA = new Date('2026-08-16T21:00:00.000Z');

  it('abrevia minutos, horas y días', () => {
    expect(hace('2026-08-16T20:58:00.000Z', AHORA)).toBe('hace 2 min');
    expect(hace('2026-08-16T18:00:00.000Z', AHORA)).toBe('hace 3 h');
    expect(hace('2026-08-11T21:00:00.000Z', AHORA)).toBe('hace 5 d');
  });

  it('abrevia el singular igual que el plural', () => {
    expect(hace('2026-08-16T20:59:00.000Z', AHORA)).toBe('hace 1 min');
    expect(hace('2026-08-16T20:00:00.000Z', AHORA)).toBe('hace 1 h');
  });

  it('una fecha inválida da vacío', () => {
    expect(hace('no es una fecha', AHORA)).toBe('');
  });
});

describe('estadoAsistencia', () => {
  // Horario real del usuario: los módulos arrancan 19:10 y terminan 23:00.
  const h = horario(4, '19:10', '23:00');

  it('antes de la ventana: "Empieza HH:MM"', () => {
    expect(estadoAsistencia(h, ba(`${JUEVES} 18:00`))).toEqual({
      fase: 'antes',
      activa: false,
      texto: 'Empieza 19:10',
    });
    // 19:00 es el borde: 11 min antes todavía es "antes".
    expect(estadoAsistencia(h, ba(`${JUEVES} 18:59`)).fase).toBe('antes');
  });

  it('la ventana abre 10 min antes del inicio (19:00 para una clase de 19:10)', () => {
    expect(estadoAsistencia(h, ba(`${JUEVES} 19:00`))).toEqual({
      fase: 'activa',
      activa: true,
      texto: 'En 10 min',
    });
    expect(estadoAsistencia(h, ba(`${JUEVES} 19:02`)).texto).toBe('En 8 min');
  });

  it('ya empezada pero sin terminar: "Ahora"', () => {
    expect(estadoAsistencia(h, ba(`${JUEVES} 19:10`))).toEqual({
      fase: 'activa',
      activa: true,
      texto: 'Ahora',
    });
    expect(estadoAsistencia(h, ba(`${JUEVES} 22:59`)).texto).toBe('Ahora');
  });

  it('terminada en el instante del fin: "Terminó HH:MM"', () => {
    expect(estadoAsistencia(h, ba(`${JUEVES} 23:00`))).toEqual({
      fase: 'terminada',
      activa: false,
      texto: 'Terminó 23:00',
    });
    expect(estadoAsistencia(h, ba(`${JUEVES} 23:30`)).fase).toBe('terminada');
  });

  it('usa la hora de pared de Buenos Aires, no la del proceso', () => {
    // 22:05 UTC = 19:05 en BA → ventana activa.
    expect(estadoAsistencia(h, new Date('2026-08-13T22:05:00.000Z')).activa).toBe(true);
  });

  it('MIN_ANTES_ASISTENCIA es 10', () => {
    expect(MIN_ANTES_ASISTENCIA).toBe(10);
  });
});
