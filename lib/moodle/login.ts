/**
 * Generación del token del web service, contra `{url}/login/token.php`.
 * SOLO SERVIDOR. No importar desde un client component.
 *
 * ── SEGURIDAD (no negociable) ───────────────────────────────────────────────
 * La contraseña entra por parámetro, se usa ÚNICAMENTE para armar el body de
 * ese fetch y se descarta apenas se usa:
 *   - no se guarda en disco ni en ninguna variable de módulo,
 *   - no se loguea (ni truncada, ni dentro de un error, ni en un stack),
 *   - no se devuelve al cliente,
 *   - los errores que se propagan son mensajes propios, nunca el body crudo
 *     de Moodle (que puede reflejar datos de la cuenta).
 * Este archivo es el único lugar del proyecto donde una contraseña aparece.
 * ────────────────────────────────────────────────────────────────────────────
 */

/** El servicio que habilita la app móvil (el mismo que usa scripts/token.sh). */
const SERVICIO = 'moodle_mobile_app';

export type ResultadoLogin = { ok: true; token: string } | { ok: false; error: string };

/**
 * Mensajes en castellano rioplatense por errorcode de Moodle. Nunca se filtra
 * el mensaje crudo: puede traer el nombre de usuario u otros datos.
 */
function mensajeDeError(errorcode: string | undefined, error: string | undefined): string {
  const codigo = (errorcode ?? '').toLowerCase();
  const crudo = (error ?? '').toLowerCase();

  if (codigo === 'invalidlogin' || crudo.includes('invalid login')) {
    return 'Usuario o contraseña incorrectos.';
  }
  if (
    codigo === 'usersuspended' ||
    codigo === 'userlocked' ||
    crudo.includes('suspend') ||
    crudo.includes('lock')
  ) {
    return 'Tu usuario está bloqueado o suspendido en el aula virtual.';
  }
  if (
    codigo === 'enablewsdescription' ||
    codigo === 'servicenotavailable' ||
    codigo === 'noservice' ||
    crudo.includes('web service')
  ) {
    return 'El aula virtual tiene el servicio de la app deshabilitado.';
  }
  if (codigo === 'sitepolicynotagreed') {
    return 'Tenés que aceptar las políticas del sitio entrando al aula virtual.';
  }
  return 'No pudimos generar el token. Probá de nuevo.';
}

/**
 * Pide un token a Moodle con usuario + contraseña.
 *
 * `password` se consume acá adentro y no sale nunca de esta función.
 */
export async function pedirToken(
  url: string,
  usuario: string,
  password: string
): Promise<ResultadoLogin> {
  const base = url.replace(/\/+$/, '');
  const body = new URLSearchParams();
  body.set('username', usuario);
  body.set('password', password);
  body.set('service', SERVICIO);

  let res: Response;
  try {
    res = await fetch(`${base}/login/token.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      cache: 'no-store',
    });
  } catch {
    // El error de red podría incluir el body: no se propaga nada de él.
    return { ok: false, error: 'No pudimos conectarnos al aula virtual.' };
  } finally {
    // El body con la contraseña deja de ser alcanzable apenas sale el request.
    body.delete('password');
  }

  let json: unknown;
  try {
    json = JSON.parse(await res.text());
  } catch {
    return { ok: false, error: 'El aula virtual respondió algo que no entendimos.' };
  }

  const cuerpo = (json ?? {}) as { token?: unknown; error?: unknown; errorcode?: unknown };
  if (typeof cuerpo.token === 'string' && cuerpo.token.length > 0) {
    return { ok: true, token: cuerpo.token };
  }
  return {
    ok: false,
    error: mensajeDeError(
      typeof cuerpo.errorcode === 'string' ? cuerpo.errorcode : undefined,
      typeof cuerpo.error === 'string' ? cuerpo.error : undefined
    ),
  };
}
