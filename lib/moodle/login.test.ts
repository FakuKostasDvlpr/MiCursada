// Generación del token (login/token.php). El fetch se mockea: no se usan
// credenciales reales, y se verifica que la contraseña no se filtre.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { pedirToken } from './login';

const URL = 'https://aula.example';
const PASSWORD = 'sup3r-secreta';

afterEach(() => {
  vi.restoreAllMocks();
});

/** Cada llamada devuelve un Response nuevo: el body se consume una sola vez. */
const responder = (cuerpo: unknown) =>
  vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async () => new Response(JSON.stringify(cuerpo), { status: 200 }));

describe('pedirToken', () => {
  it('manda username/password/service y devuelve el token', async () => {
    const fetchMock = responder({ token: 'tok1' });
    const r = await pedirToken(`${URL}/`, 'usuario', PASSWORD);
    expect(r).toEqual({ ok: true, token: 'tok1' });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${URL}/login/token.php`);
    const body = new URLSearchParams(init.body as string);
    expect(body.get('username')).toBe('usuario');
    expect(body.get('service')).toBe('moodle_mobile_app');
    expect(body.get('password')).toBe(PASSWORD);
  });

  it('credenciales inválidas → mensaje claro, sin el crudo de Moodle', async () => {
    responder({ error: 'Invalid login, please try again', errorcode: 'invalidlogin' });
    const r = await pedirToken(URL, 'usuario', PASSWORD);
    expect(r).toEqual({ ok: false, error: 'Usuario o contraseña incorrectos.' });
  });

  it('usuario suspendido y servicio deshabilitado tienen mensajes propios', async () => {
    responder({ error: 'x', errorcode: 'usersuspended' });
    await expect(pedirToken(URL, 'u', PASSWORD)).resolves.toEqual({
      ok: false,
      error: 'Tu usuario está bloqueado o suspendido en el aula virtual.',
    });

    responder({ error: 'x', errorcode: 'enablewsdescription' });
    await expect(pedirToken(URL, 'u', PASSWORD)).resolves.toEqual({
      ok: false,
      error: 'El aula virtual tiene el servicio de la app deshabilitado.',
    });
  });

  it('un error desconocido no filtra el mensaje crudo (puede traer datos de la cuenta)', async () => {
    responder({ error: `la cuenta de fulano@ort con clave ${PASSWORD}`, errorcode: 'raro' });
    const r = await pedirToken(URL, 'u', PASSWORD);
    expect(r).toEqual({ ok: false, error: 'No pudimos generar el token. Probá de nuevo.' });
    expect(JSON.stringify(r)).not.toContain(PASSWORD);
  });

  it('un fallo de red no propaga nada del pedido', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error(`connect fail ${PASSWORD}`));
    const r = await pedirToken(URL, 'u', PASSWORD);
    expect(r).toEqual({ ok: false, error: 'No pudimos conectarnos al aula virtual.' });
    expect(JSON.stringify(r)).not.toContain(PASSWORD);
  });

  it('respuesta no-JSON → error propio', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('<html>502</html>'));
    await expect(pedirToken(URL, 'u', PASSWORD)).resolves.toEqual({
      ok: false,
      error: 'El aula virtual respondió algo que no entendimos.',
    });
  });
});
