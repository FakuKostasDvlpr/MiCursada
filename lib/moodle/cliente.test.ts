// Cliente de Moodle: allowlist, serialización de params, detección de errores
// por body y sanitización del token. El fetch se mockea: acá no sale nada a la red.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FUNCIONES_PERMITIDAS,
  MoodleError,
  SinToken,
  TokenInvalido,
  call,
  sanitizar,
  serializarParams,
  type FuncionMoodle,
} from './cliente';
import type { Credencial } from './credenciales';

const CRED: Credencial = {
  token: 'tok-secreto-abc123',
  url: 'https://aula.example',
  userid: 10747,
  guardadoEn: '2026-08-16T20:00:00.000Z',
};

const respuesta = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status });

afterEach(() => {
  vi.restoreAllMocks();
});

// Ojo: el cliente encola las llamadas con 500 ms entre sí (a propósito), así
// que cada test que llama a `call` tarda medio segundo. Timers reales para no
// pelearse con la cola.

describe('allowlist', () => {
  it('es 100 % de lectura (ninguna función de escritura conocida)', () => {
    const prohibidas = [
      'mod_assign_save_submission',
      'core_message_send_instant_messages',
      'mod_forum_add_discussion_post',
    ];
    for (const p of prohibidas) {
      expect(FUNCIONES_PERMITIDAS as readonly string[]).not.toContain(p);
    }
  });

  it('rechaza en RUNTIME una función fuera de la lista, sin hacer fetch', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    await expect(
      call('mod_assign_save_submission' as unknown as FuncionMoodle, {}, CRED)
    ).rejects.toThrow(/fuera de la allowlist/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('serializarParams', () => {
  it('serializa arrays INDEXADOS (courseids[0]=)', () => {
    expect(serializarParams({ courseids: [10, 20] }).toString()).toBe(
      'courseids%5B0%5D=10&courseids%5B1%5D=20'
    );
  });

  it('serializa objetos anidados y arrays de objetos', () => {
    expect(
      decodeURIComponent(serializarParams({ a: { b: [{ c: 1 }] }, d: true }).toString())
    ).toBe('a[b][0][c]=1&d=true');
  });
});

describe('sanitizar', () => {
  it('reemplaza el valor concreto del token, aparezca donde aparezca', () => {
    expect(sanitizar(`fallo con ${CRED.token} adentro`, CRED.token)).toBe(
      'fallo con [TOKEN] adentro'
    );
  });

  it('redacta también por patrón, sin conocer el valor', () => {
    expect(sanitizar('https://x/f.pdf?token=otracosa123')).toBe('https://x/f.pdf?token=***');
  });
});

/** Devuelve el Error con el que rechazó la promesa (falla si resuelve). */
async function atrapar(p: Promise<unknown>): Promise<Error> {
  try {
    await p;
  } catch (e) {
    return e as Error;
  }
  throw new Error('se esperaba un rechazo y la llamada resolvió');
}

describe('call', () => {
  it('hace POST form-urlencoded con wstoken/wsfunction y devuelve el JSON', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(respuesta({ sitename: 'Aula' }));

    const data = await call('core_webservice_get_site_info', { userid: 1 }, CRED);
    expect(data).toEqual({ sitename: 'Aula' });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://aula.example/webservice/rest/server.php');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/x-www-form-urlencoded' });
    const body = new URLSearchParams(init.body as string);
    expect(body.get('wsfunction')).toBe('core_webservice_get_site_info');
    expect(body.get('moodlewsrestformat')).toBe('json');
    expect(body.get('wstoken')).toBe(CRED.token);
  });

  it('detecta el error por BODY aunque el status sea 200', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      respuesta({ exception: 'moodle_exception', errorcode: 'nopermissions', message: 'nel' }, 200)
    );
    await expect(call('core_enrol_get_users_courses', {}, CRED)).rejects.toBeInstanceOf(
      MoodleError
    );
  });

  it('errorcode invalidtoken → TokenInvalido', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      respuesta({ exception: 'moodle_exception', errorcode: 'invalidtoken', message: 'x' }, 200)
    );
    await expect(call('core_enrol_get_users_courses', {}, CRED)).rejects.toBeInstanceOf(
      TokenInvalido
    );
  });

  it('nunca deja el token en el mensaje de error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      respuesta({
        exception: 'moodle_exception',
        errorcode: 'x',
        message: `falló con wstoken=${CRED.token}`,
      })
    );
    const error = await atrapar(call('core_enrol_get_users_courses', {}, CRED));
    expect(error.message).not.toContain(CRED.token);
  });

  it('una respuesta no-JSON da un error legible y sanitizado', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(`<html>error con ${CRED.token}</html>`, { status: 500 })
    );
    const error = await atrapar(call('core_enrol_get_users_courses', {}, CRED));
    expect(error.message).toMatch(/Respuesta no-JSON/);
    expect(error.message).not.toContain(CRED.token);
  });

  it('sin credencial (ni archivo ni entorno) tira SinToken y no hace fetch', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const previoDir = process.env.CURSADA_DATOS_DIR;
    const previoToken = process.env.MOODLE_TOKEN;
    process.env.CURSADA_DATOS_DIR = 'C:/no/existe/cursada-test';
    delete process.env.MOODLE_TOKEN;
    try {
      await expect(call('core_webservice_get_site_info')).rejects.toBeInstanceOf(SinToken);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      if (previoDir === undefined) delete process.env.CURSADA_DATOS_DIR;
      else process.env.CURSADA_DATOS_DIR = previoDir;
      if (previoToken !== undefined) process.env.MOODLE_TOKEN = previoToken;
    }
  });
});
