// Almacén de sesiones. Cada test corre contra un tmpdir propio apuntado con
// CURSADA_DATOS_DIR, así no toca datos/sesiones.json real.

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DIAS_SESION,
  borrarSesion,
  borrarTodasLasSesiones,
  crearSesion,
  loginDeshabilitado,
  rutaSesiones,
  validarSesion,
} from './sesion';

let dir = '';
const entornoPrevio = {
  datos: process.env.CURSADA_DATOS_DIR,
  sinLogin: process.env.CURSADA_SIN_LOGIN,
};

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cursada-sesion-'));
  process.env.CURSADA_DATOS_DIR = dir;
  delete process.env.CURSADA_SIN_LOGIN;
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
  for (const [clave, valor] of [
    ['CURSADA_DATOS_DIR', entornoPrevio.datos],
    ['CURSADA_SIN_LOGIN', entornoPrevio.sinLogin],
  ] as const) {
    if (valor === undefined) delete process.env[clave];
    else process.env[clave] = valor;
  }
});

const enDias = (d: number) => new Date(Date.now() + d * 24 * 60 * 60 * 1000);

describe('crearSesion / validarSesion', () => {
  it('una sesión recién creada vale', async () => {
    const token = await crearSesion('Fulano de Tal');
    const sesion = await validarSesion(token);
    expect(sesion?.nombre).toBe('Fulano de Tal');
  });

  it('un token que no existe no vale (ni undefined, ni vacío)', async () => {
    await crearSesion();
    expect(await validarSesion('inventado')).toBeNull();
    expect(await validarSesion(undefined)).toBeNull();
    expect(await validarSesion('')).toBeNull();
  });

  it('NUNCA guarda el token en claro: en disco va el hash', async () => {
    const token = await crearSesion();
    const archivo = await fs.readFile(rutaSesiones(), 'utf8');
    expect(archivo).not.toContain(token);
    expect(JSON.parse(archivo).sesiones[0].id).toMatch(/^[0-9a-f]{64}$/);
  });

  it('vence a los DIAS_SESION días', async () => {
    const token = await crearSesion();
    expect(await validarSesion(token, enDias(DIAS_SESION - 1))).not.toBeNull();
    expect(await validarSesion(token, enDias(DIAS_SESION + 1))).toBeNull();
  });

  it('conviven varias sesiones (celu y compu)', async () => {
    const uno = await crearSesion('celu');
    const dos = await crearSesion('compu');
    expect((await validarSesion(uno))?.nombre).toBe('celu');
    expect((await validarSesion(dos))?.nombre).toBe('compu');
  });

  it('al crear una, limpia las vencidas', async () => {
    await crearSesion('vieja', enDias(-(DIAS_SESION + 2)));
    await crearSesion('nueva');
    const guardadas = JSON.parse(await fs.readFile(rutaSesiones(), 'utf8')).sesiones;
    expect(guardadas).toHaveLength(1);
    expect(guardadas[0].nombre).toBe('nueva');
  });

  it('sin archivo no rompe', async () => {
    expect(await validarSesion('cualquiera')).toBeNull();
  });

  it('un archivo roto no rompe: no hay sesión', async () => {
    await fs.writeFile(rutaSesiones(), '{ esto no es json', 'utf8');
    expect(await validarSesion('cualquiera')).toBeNull();
  });
});

describe('borrarSesion', () => {
  it('cierra solo la sesión de ese token', async () => {
    const celu = await crearSesion('celu');
    const compu = await crearSesion('compu');

    await borrarSesion(celu);

    expect(await validarSesion(celu)).toBeNull();
    expect(await validarSesion(compu)).not.toBeNull();
  });

  it('no falla con un token que no existe ni con undefined', async () => {
    await expect(borrarSesion('inventado')).resolves.toBeUndefined();
    await expect(borrarSesion(undefined)).resolves.toBeUndefined();
  });
});

describe('borrarTodasLasSesiones', () => {
  it('cierra todo', async () => {
    const uno = await crearSesion();
    const dos = await crearSesion();

    await borrarTodasLasSesiones();

    expect(await validarSesion(uno)).toBeNull();
    expect(await validarSesion(dos)).toBeNull();
  });
});

describe('loginDeshabilitado', () => {
  it('solo con CURSADA_SIN_LOGIN=1', () => {
    expect(loginDeshabilitado()).toBe(false);
    process.env.CURSADA_SIN_LOGIN = '0';
    expect(loginDeshabilitado()).toBe(false);
    process.env.CURSADA_SIN_LOGIN = '1';
    expect(loginDeshabilitado()).toBe(true);
  });
});
