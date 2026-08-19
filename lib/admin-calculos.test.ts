import { describe, expect, it } from 'vitest';
import {
  armarStats,
  armarUsuario,
  colorAvatar,
  duracionSesion,
  estadoSync,
  estadoUsuario,
  textoEvento,
  ultimaActividad,
  xpTotal,
  type UsuarioCrudo,
} from '@/lib/admin-calculos';

const AHORA = new Date('2026-08-18T12:00:00.000Z');

/** ISO de hace `min` minutos respecto de AHORA. */
const haceMin = (min: number) => new Date(AHORA.getTime() - min * 60_000).toISOString();

function usuario(extra: Partial<UsuarioCrudo> = {}): UsuarioCrudo {
  return {
    id: 'u1',
    nombre: 'Federico Álvarez',
    carrera: 'Analista de Sistemas',
    usuario: 'falvarez',
    avatarUrl: null,
    ultimaVisita: haceMin(5),
    materias: 5,
    notas: 48,
    notasHoy: 6,
    tareasHechas: 12,
    tareasTotal: 19,
    archivos: 14,
    avisosPend: 3,
    avisosVencidos: 0,
    porMateria: [
      { nombre: 'Programación II', notas: 30 },
      { nombre: 'Análisis', notas: 10 },
      { nombre: 'Inglés', notas: 8 },
    ],
    eventos: [{ ts: haceMin(4), evento: 'sesion_iniciada', datos: {} }],
    sync: { ok: true, cuando: haceMin(120) },
    sesionIniciadaHoy: haceMin(42),
    ...extra,
  };
}

describe('estadoUsuario', () => {
  it('umbrales exactos: <30 min online, <24 h inactivo, resto offline', () => {
    expect(estadoUsuario(haceMin(29), AHORA)).toBe('online');
    expect(estadoUsuario(haceMin(30), AHORA)).toBe('inactivo');
    expect(estadoUsuario(haceMin(24 * 60 - 1), AHORA)).toBe('inactivo');
    expect(estadoUsuario(haceMin(24 * 60), AHORA)).toBe('offline');
  });
});

describe('xpTotal', () => {
  it('sigue los hitos del logro', () => {
    expect(xpTotal(0)).toBe(0);
    expect(xpTotal(1)).toBe(50);
    expect(xpTotal(4)).toBe(50);
    expect(xpTotal(5)).toBe(150);
    expect(xpTotal(10)).toBe(300);
    expect(xpTotal(24)).toBe(300);
    expect(xpTotal(25)).toBe(550);
    expect(xpTotal(50)).toBe(800);
  });
});

describe('duracionSesion', () => {
  it('minutos cortos y formato h/min', () => {
    expect(duracionSesion(haceMin(42), AHORA)).toBe('42 min');
    expect(duracionSesion(haceMin(65), AHORA)).toBe('1 h 05');
  });
});

describe('textoEvento', () => {
  it('mapea tipo a texto y color, sin contenido', () => {
    expect(textoEvento({ ts: '', evento: 'sync_ok', datos: { cursos: 7 } }).txt).toBe(
      'Sincronizó el aula virtual (7 cursos)'
    );
    expect(textoEvento({ ts: '', evento: 'nota_creada', datos: { curso: 'Análisis' } }).txt).toBe(
      'Creó una nota en Análisis'
    );
    expect(textoEvento({ ts: '', evento: 'nota_creada', datos: {} }).txt).toBe('Creó una nota');
    expect(textoEvento({ ts: '', evento: 'sync_error', datos: {} }).col).toBe('#fb7185');
  });
});

describe('ultimaActividad', () => {
  it('activa → último evento; offline → último acceso', () => {
    const ev = { ts: haceMin(4), evento: 'sesion_iniciada', datos: {} };
    expect(ultimaActividad('online', ev, haceMin(5), AHORA)).toBe('Entró a la app');
    expect(ultimaActividad('offline', ev, haceMin(3 * 24 * 60), AHORA)).toMatch(/^Último acceso hace/);
  });
});

describe('estadoSync', () => {
  it('ok, error y nunca conectado', () => {
    expect(estadoSync({ ok: true, cuando: haceMin(120) }, AHORA)).toMatch(/^ok · hace/);
    expect(estadoSync({ ok: false, cuando: haceMin(360) }, AHORA)).toMatch(/^error · hace/);
    expect(estadoSync(null, AHORA)).toBe('nunca conectado');
  });
});

describe('colorAvatar', () => {
  it('es determinístico y cae en la paleta', () => {
    expect(colorAvatar('u1')).toBe(colorAvatar('u1'));
    expect(colorAvatar('u1')).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('armarUsuario', () => {
  it('arma la fila completa: estado, sesión, métricas y top de materias', () => {
    const u = armarUsuario(usuario(), AHORA);
    expect(u.estado).toBe('online');
    expect(u.sesion).toBe('42 min');
    expect(u.actividad).toBe('Entró a la app');
    expect(u.metricas.map((m) => m.k)).toEqual([
      'materias',
      'notas',
      'to-dos',
      'archivos',
      'avisos pend.',
      'xp',
    ]);
    // 12/19 hechas = 63% → ámbar
    expect(u.metricas[2]?.col).toBe('var(--acc)');
    expect(u.materiasTop[0]).toEqual({ k: 'Programación II', pct: 63 });
    expect(u.sync).toMatch(/^ok · hace/);
  });

  it('sin sesión de hoy u offline la columna Sesión es "—"', () => {
    expect(armarUsuario(usuario({ sesionIniciadaHoy: null }), AHORA).sesion).toBe('—');
    expect(
      armarUsuario(usuario({ ultimaVisita: haceMin(3 * 24 * 60) }), AHORA).sesion
    ).toBe('—');
  });
});

describe('armarStats', () => {
  it('agrega activos, syncs y vencidos sobre todos los usuarios', () => {
    const lista = [
      usuario(),
      usuario({ id: 'u2', ultimaVisita: haceMin(90), sync: { ok: false, cuando: haceMin(360) }, avisosVencidos: 5, notasHoy: 1 }),
      usuario({ id: 'u3', ultimaVisita: haceMin(8 * 24 * 60), sync: null, notasHoy: 0, avisosVencidos: 2 }),
    ];
    const s = armarStats(lista, AHORA);
    expect(s.map((x) => [x.k, x.v])).toEqual([
      ['activas ahora', '1'],
      ['usuarias totales', '3'],
      ['notas creadas hoy', '7'],
      ['activas esta semana', '2'],
      ['syncs ok', '1/3'],
      ['avisos vencidos', '7'],
    ]);
    expect(s[4]?.delta).toBe('1 error · 1 nunca');
    expect(s[5]?.delta).toBe('en 2 usuarios');
  });
});
