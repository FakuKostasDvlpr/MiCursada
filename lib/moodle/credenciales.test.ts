// Credenciales del aula virtual. Cada test corre contra un tmpdir propio
// apuntado con CURSADA_DATOS_DIR, así no toca datos/moodle.json real.

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  URL_MOODLE_DEFAULT,
  USERID_DEFAULT,
  estadoCredencial,
  guardarCredenciales,
  guardarVerificacion,
  hayCredenciales,
  leerCredenciales,
  olvidarCredenciales,
  rutaCredenciales,
} from './credenciales';

let dir = '';
const entornoPrevio = {
  datos: process.env.CURSADA_DATOS_DIR,
  token: process.env.MOODLE_TOKEN,
  url: process.env.MOODLE_URL,
  userid: process.env.MOODLE_USERID,
};

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cursada-moodle-'));
  process.env.CURSADA_DATOS_DIR = dir;
  delete process.env.MOODLE_TOKEN;
  delete process.env.MOODLE_URL;
  delete process.env.MOODLE_USERID;
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
  for (const [clave, valor] of [
    ['CURSADA_DATOS_DIR', entornoPrevio.datos],
    ['MOODLE_TOKEN', entornoPrevio.token],
    ['MOODLE_URL', entornoPrevio.url],
    ['MOODLE_USERID', entornoPrevio.userid],
  ] as const) {
    if (valor === undefined) delete process.env[clave];
    else process.env[clave] = valor;
  }
});

const CRED = {
  token: 'tok-de-prueba-123',
  url: URL_MOODLE_DEFAULT,
  userid: 10747,
  guardadoEn: '2026-08-16T20:00:00.000Z',
};

describe('leerCredenciales', () => {
  it('devuelve null si no hay archivo ni MOODLE_TOKEN', async () => {
    expect(await leerCredenciales()).toBeNull();
    expect(await hayCredenciales()).toBe(false);
  });

  it('lee lo que se guardó', async () => {
    await guardarCredenciales(CRED);
    expect(await leerCredenciales()).toEqual(CRED);
    expect(await hayCredenciales()).toBe(true);
  });

  it('normaliza la barra final de la url y completa los defaults', async () => {
    await fs.writeFile(
      rutaCredenciales(),
      JSON.stringify({ token: 'abc', url: `${URL_MOODLE_DEFAULT}/` }),
      'utf8'
    );
    const cred = await leerCredenciales();
    expect(cred?.url).toBe(URL_MOODLE_DEFAULT);
    expect(cred?.userid).toBe(USERID_DEFAULT);
    expect(typeof cred?.guardadoEn).toBe('string');
  });

  it('cae a MOODLE_TOKEN del entorno si no hay archivo', async () => {
    process.env.MOODLE_TOKEN = 'del-entorno';
    process.env.MOODLE_URL = 'https://otra.example/';
    process.env.MOODLE_USERID = '42';
    const cred = await leerCredenciales();
    expect(cred?.token).toBe('del-entorno');
    expect(cred?.url).toBe('https://otra.example');
    expect(cred?.userid).toBe(42);
  });

  it('un archivo roto no rompe: cae al entorno (o a null)', async () => {
    await fs.writeFile(rutaCredenciales(), '{ esto no es json', 'utf8');
    expect(await leerCredenciales()).toBeNull();
    process.env.MOODLE_TOKEN = 'del-entorno';
    expect((await leerCredenciales())?.token).toBe('del-entorno');
  });
});

describe('estadoCredencial', () => {
  it('NUNCA incluye el token', () => {
    const estado = estadoCredencial({ ...CRED, ultimaVerificacion: { ok: true, cuando: 'x' } });
    expect(JSON.stringify(estado)).not.toContain(CRED.token);
    expect('token' in estado).toBe(false);
    expect(estado.userid).toBe(10747);
  });
});

describe('guardarVerificacion', () => {
  it('mergea la verificación conservando el token', async () => {
    await guardarCredenciales(CRED);
    await guardarVerificacion({ ok: true, cuando: '2026-08-17T00:00:00.000Z', nombre: 'Fulano' });
    const cred = await leerCredenciales();
    expect(cred?.token).toBe(CRED.token);
    expect(cred?.ultimaVerificacion).toEqual({
      ok: true,
      cuando: '2026-08-17T00:00:00.000Z',
      nombre: 'Fulano',
    });
  });

  it('no crea el archivo si no existía (credencial del entorno)', async () => {
    await guardarVerificacion({ ok: false, cuando: 'x', error: 'vencido' });
    await expect(fs.access(rutaCredenciales())).rejects.toThrow();
  });
});

describe('olvidarCredenciales', () => {
  it('borra moodle.json y solo eso', async () => {
    await guardarCredenciales(CRED);
    const otro = path.join(dir, 'horarios.json');
    await fs.writeFile(otro, '{"curso:1":[]}', 'utf8');

    await olvidarCredenciales();

    expect(await leerCredenciales()).toBeNull();
    expect(await fs.readFile(otro, 'utf8')).toBe('{"curso:1":[]}');
  });

  it('no falla si no había archivo', async () => {
    await expect(olvidarCredenciales()).resolves.toBeUndefined();
  });
});
