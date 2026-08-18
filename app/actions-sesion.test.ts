// Login y logout. El fetch al aula virtual se mockea: no se usan credenciales
// reales. Cada test corre contra un tmpdir propio (CURSADA_DATOS_DIR).

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

// `redirect` de Next corta la ejecución tirando: se emula igual para que el
// test note la diferencia entre "redirigió" y "siguió de largo".
const nav = vi.hoisted(() => ({ destino: '' }));
vi.mock('next/navigation', () => ({
  redirect: (destino: string) => {
    nav.destino = destino;
    throw new Error('NEXT_REDIRECT');
  },
}));

// Cookie jar mutable: lo que la action escriba o borre queda acá.
const jar = vi.hoisted(() => ({ valor: undefined as string | undefined }));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (nombre: string) => (jar.valor ? { name: nombre, value: jar.valor } : undefined),
    set: (_nombre: string, valor: string) => {
      jar.valor = valor;
    },
    delete: () => {
      jar.valor = undefined;
    },
  }),
  headers: async () => new Headers(),
}));

// La sincronización real vive en actions-moodle (habla con Moodle de verdad):
// acá interesa CUÁNDO se la llama, no lo que hace.
const sync = vi.hoisted(() => ({
  llamadas: 0,
  resultado: { ok: true, materias: 5, archivos: 9, avisos: 3, cuando: '2026-08-16T20:00:00.000Z' } as
    | { ok: true; materias: number; archivos: number; avisos: number; cuando: string }
    | { ok: false; error: string },
}));
vi.mock('@/app/actions-moodle', () => ({
  sincronizarAhora: async () => {
    sync.llamadas++;
    return sync.resultado;
  },
}));

import {
  aceptarConsentimiento,
  borrarMiCuenta,
  cerrarSesion,
  iniciarSesion,
  montarCursada,
} from '@/app/actions-sesion';
import { rutaDatos } from '@/lib/datos-locales';
import { leerPerfilLocal } from '@/lib/datos-locales';
import { leerCredenciales } from '@/lib/moodle/credenciales';
import { crearSesion, validarSesion } from '@/lib/sesion';

const SITIO = 'Aula Virtual — Instituto de Tecnología ORT';
const NOMBRE = 'Facundo Costas';

let dir = '';
const datosPrevios = process.env.CURSADA_DATOS_DIR;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cursada-sesion-actions-'));
  process.env.CURSADA_DATOS_DIR = dir;
  delete process.env.MOODLE_TOKEN;
  delete process.env.CURSADA_USUARIOS_PERMITIDOS;
  jar.valor = undefined;
  nav.destino = '';
  sync.llamadas = 0;
  sync.resultado = {
    ok: true,
    materias: 5,
    archivos: 9,
    avisos: 3,
    cuando: '2026-08-16T20:00:00.000Z',
  };
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(dir, { recursive: true, force: true });
  if (datosPrevios === undefined) delete process.env.CURSADA_DATOS_DIR;
  else process.env.CURSADA_DATOS_DIR = datosPrevios;
});

/**
 * Moodle de mentira: /login/token.php devuelve `token` (o el error que se le
 * pase) y el web service devuelve el site info.
 */
function mockearAula(opciones?: { login?: unknown; userid?: number; sitename?: string }) {
  const login = opciones?.login ?? { token: 'tok-nuevo' };
  const site = {
    sitename: opciones?.sitename ?? SITIO,
    username: 'fcostas',
    fullname: NOMBRE,
    userid: opciones?.userid ?? 10747,
    siteurl: 'https://aula.example',
    functions: [],
  };
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (entrada) => {
    const url = String(entrada);
    const cuerpo = url.includes('/login/token.php') ? login : site;
    return new Response(JSON.stringify(cuerpo), { status: 200 });
  });
}

describe('iniciarSesion', () => {
  it('con credenciales buenas guarda el token, abre sesión y no devuelve nada sensible', async () => {
    mockearAula();

    const r = await iniciarSesion('fcostas', 'la-contraseña');

    expect(r).toEqual({ ok: true, nombre: NOMBRE });
    expect(JSON.stringify(r)).not.toContain('la-contraseña');
    expect(JSON.stringify(r)).not.toContain('tok-nuevo');

    // Token guardado y sesión abierta con la cookie puesta.
    expect((await leerCredenciales())?.token).toBe('tok-nuevo');
    expect(jar.valor).toBeTruthy();
    expect(await validarSesion(jar.valor)).not.toBeNull();
  });

  it('trae el instituto del site info (no se escribe a mano) y el nombre del aula virtual', async () => {
    mockearAula();

    await iniciarSesion('fcostas', 'x');

    expect(await leerPerfilLocal()).toMatchObject({ nombre: NOMBRE, instituto: SITIO });
  });

  it('el instituto se actualiza si el sitio cambió de nombre; el tuyo no se pisa', async () => {
    mockearAula();
    await iniciarSesion('fcostas', 'x');
    vi.restoreAllMocks();

    mockearAula({ sitename: 'Campus ORT' });
    await iniciarSesion('fcostas', 'x');

    expect(await leerPerfilLocal()).toMatchObject({ nombre: NOMBRE, instituto: 'Campus ORT' });
  });

  it('con la contraseña mal no abre sesión ni guarda nada', async () => {
    mockearAula({ login: { error: 'Invalid login', errorcode: 'invalidlogin' } });

    const r = await iniciarSesion('fcostas', 'mal');

    expect(r).toEqual({ ok: false, error: 'Usuario o contraseña incorrectos.' });
    expect(jar.valor).toBeUndefined();
    expect(await leerCredenciales()).toBeNull();
  });

  it('con la lista puesta, un usuario habilitado entra normal', async () => {
    process.env.CURSADA_USUARIOS_PERMITIDOS = ' FCostas , otrapersona ';
    mockearAula();

    const r = await iniciarSesion('fcostas', 'x');

    expect(r).toEqual({ ok: true, nombre: NOMBRE });
    expect(jar.valor).toBeTruthy();
  });

  it('con la lista puesta, un usuario que no está queda afuera y no se guarda nada', async () => {
    process.env.CURSADA_USUARIOS_PERMITIDOS = 'otrapersona';
    mockearAula(); // el aula verifica el login, pero el username no está en la lista

    const r = await iniciarSesion('fcostas', 'x');

    expect(r).toEqual({ ok: false, error: 'Tu cuenta no está habilitada en esta app.' });
    expect(jar.valor).toBeUndefined();
    expect(await leerCredenciales()).toBeNull();
    expect(await leerPerfilLocal()).toBeNull();
  });

  it('otra cuenta del aula virtual no entra ni pisa el token del dueño', async () => {
    mockearAula({ userid: 10747 });
    await iniciarSesion('fcostas', 'x');
    jar.valor = undefined;
    vi.restoreAllMocks();

    mockearAula({ userid: 99999, login: { token: 'tok-de-otro' } });
    const r = await iniciarSesion('otro', 'x');

    expect(r.ok).toBe(false);
    expect(jar.valor).toBeUndefined();
    expect((await leerCredenciales())?.token).toBe('tok-nuevo');
  });
});

describe('montarCursada', () => {
  /** Snapshot mínimo con la fecha de generado que se le pida. */
  async function snapshot(generado: string) {
    await fs.writeFile(
      rutaDatos('snapshot'),
      JSON.stringify({
        generado,
        materias: [
          { id: 'curso:1', nombre: 'Programación', color: '#38bdf8', archivos: [], bloques: [] },
        ],
        avisos: [{ id: 'assign:1', materiaId: 'curso:1', titulo: 'TP1', fecha: '2026-08-20' }],
      }),
      'utf8'
    );
  }

  it('sin snapshot baja todo', async () => {
    jar.valor = await crearSesion();

    const r = await montarCursada();

    expect(sync.llamadas).toBe(1);
    expect(r).toEqual({ ok: true, sincronizado: true, materias: 5, avisos: 3 });
  });

  it('con un snapshot fresco no vuelve a bajar nada', async () => {
    jar.valor = await crearSesion();
    await snapshot(new Date().toISOString());

    const r = await montarCursada();

    expect(sync.llamadas).toBe(0);
    expect(r).toEqual({ ok: true, sincronizado: false, materias: 1, avisos: 1 });
  });

  it('con un snapshot viejo vuelve a bajar', async () => {
    jar.valor = await crearSesion();
    await snapshot(new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString());

    await montarCursada();

    expect(sync.llamadas).toBe(1);
  });

  it('si la sincronización falla lo dice, pero no rompe', async () => {
    jar.valor = await crearSesion();
    sync.resultado = { ok: false, error: 'No pudimos conectarnos al aula virtual.' };

    const r = await montarCursada();

    expect(r).toEqual({ ok: false, error: 'No pudimos conectarnos al aula virtual.' });
  });

  it('sin sesión no monta nada', async () => {
    const r = await montarCursada();

    expect(r.ok).toBe(false);
    expect(sync.llamadas).toBe(0);
  });
});

describe('cerrarSesion', () => {
  it('borra la sesión, saca la cookie y manda a /login', async () => {
    const token = await crearSesion('Prueba');
    jar.valor = token;

    await expect(cerrarSesion()).rejects.toThrow('NEXT_REDIRECT');

    expect(nav.destino).toBe('/login');
    expect(jar.valor).toBeUndefined();
    expect(await validarSesion(token)).toBeNull();
  });

  it('cierra solo este dispositivo: la otra sesión sigue viva', async () => {
    const celu = await crearSesion('celu');
    const compu = await crearSesion('compu');
    jar.valor = compu;

    await expect(cerrarSesion()).rejects.toThrow('NEXT_REDIRECT');

    expect(await validarSesion(compu)).toBeNull();
    expect(await validarSesion(celu)).not.toBeNull();
  });
});

describe('aceptarConsentimiento', () => {
  it('sin sesión de Supabase (modo local) manda a /login', async () => {
    // Sin NEXT_PUBLIC_SUPABASE_URL/ANON_KEY, usuarioActual() siempre da null:
    // esta pantalla no existe en modo local, así que la guarda manda afuera.
    await expect(aceptarConsentimiento()).rejects.toThrow('NEXT_REDIRECT');

    expect(nav.destino).toBe('/login');
  });
});

describe('borrarMiCuenta', () => {
  it('sin sesión de Supabase (modo local) manda a /login sin tocar nada', async () => {
    // Mismo motivo que aceptarConsentimiento: usuarioActual() da null en modo
    // local, así que la guarda manda afuera antes de llegar al admin client.
    await expect(borrarMiCuenta()).rejects.toThrow('NEXT_REDIRECT');

    expect(nav.destino).toBe('/login');
  });
});
