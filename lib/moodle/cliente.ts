/**
 * Cliente REST de solo lectura para el Moodle del aula virtual de ORT.
 * Portado de cursada-sync/src/moodle.ts.
 *
 * SOLO SERVIDOR: lee el token del disco (lib/moodle/credenciales.ts) y hace
 * fetch a Moodle. Ningún client component puede importar este módulo.
 *
 * ── POR QUÉ existe la allowlist ─────────────────────────────────────────────
 * El token del servicio `moodle_mobile_app` tiene permisos de ESCRITURA sobre
 * la cuenta real del usuario: `mod_assign_save_submission` podría entregar un
 * TP, `core_message_send_instant_messages` podría mandarle mensajes a docentes
 * o compañeros, `mod_forum_add_discussion_post` postear en un foro. Un bug, un
 * typo o un prompt malicioso no pueden tener la chance de hacer eso: este
 * cliente tiene que ser INCAPAZ de escribir. Por eso:
 *   1. `call()` solo acepta funciones de la allowlist, tipada como unión
 *      literal → una función fuera de la lista no compila.
 *   2. Además se valida en runtime ANTES de armar el request → aunque alguien
 *      castee el tipo, el fetch nunca sale.
 * La allowlist es 100 % de lectura. No agregar funciones de escritura, nunca.
 * ────────────────────────────────────────────────────────────────────────────
 */
import { leerCredenciales, type Credencial } from './credenciales';
import { sinToken } from './normalizar';

export const FUNCIONES_PERMITIDAS = [
  'core_webservice_get_site_info',
  'core_enrol_get_users_courses',
  'core_course_get_contents',
  'core_calendar_get_action_events_by_timesort',
  'mod_assign_get_assignments',
  'mod_assign_get_submission_status',
  'gradereport_user_get_grade_items',
  'mod_forum_get_forums_by_courses',
  'mod_forum_get_forum_discussions',
  'core_calendar_get_calendar_export_token',
] as const;

export type FuncionMoodle = (typeof FUNCIONES_PERMITIDAS)[number];

/** Valores serializables como parámetros de la API. */
export type ParamsMoodle = {
  [clave: string]:
    | number
    | string
    | boolean
    | ParamsMoodle
    | Array<number | string | boolean | ParamsMoodle>;
};

/** Error genérico devuelto por Moodle en el body (con HTTP 200). */
export class MoodleError extends Error {
  constructor(
    public readonly errorcode: string,
    mensaje: string,
    public readonly wsfunction: string
  ) {
    super(`Moodle respondió con error en ${wsfunction}: [${errorcode}] ${mensaje}`);
    this.name = 'MoodleError';
  }
}

/** El token no es válido (errorcode === 'invalidtoken') o directamente no hay. */
export class TokenInvalido extends MoodleError {
  constructor(wsfunction: string) {
    super('invalidtoken', 'El token de Moodle no es válido o expiró.', wsfunction);
    this.name = 'TokenInvalido';
  }
}

/** No hay token configurado todavía (ni archivo ni MOODLE_TOKEN). */
export class SinToken extends Error {
  constructor() {
    super('No hay token del aula virtual configurado.');
    this.name = 'SinToken';
  }
}

/**
 * Quita el token de cualquier texto (URLs, mensajes de error, bodies).
 * El token NUNCA se loguea, ni truncado.
 *
 * El reemplazo por patrón vive en normalizar.ts (`sinToken`) para que haya una
 * sola implementación; acá se agrega lo que solo este módulo sabe: el valor
 * concreto del token en uso, que puede aparecer sin el `token=` delante.
 */
export function sanitizar(texto: string, token?: string): string {
  let salida = texto;
  if (token) salida = salida.split(token).join('[TOKEN]');
  // por si el server refleja el parámetro con otro valor
  return sinToken(salida);
}

/**
 * Serializa params al formato form-urlencoded de Moodle, con arrays
 * INDEXADOS (`courseids[0]=123`) y objetos anidados (`a[b][0][c]=1`).
 */
export function serializarParams(
  params: ParamsMoodle,
  destino: URLSearchParams = new URLSearchParams(),
  prefijo = ''
): URLSearchParams {
  for (const [clave, valor] of Object.entries(params)) {
    const nombre = prefijo === '' ? clave : `${prefijo}[${clave}]`;
    if (Array.isArray(valor)) {
      valor.forEach((item, i) => {
        if (typeof item === 'object' && item !== null) {
          serializarParams(item, destino, `${nombre}[${i}]`);
        } else {
          destino.append(`${nombre}[${i}]`, String(item));
        }
      });
    } else if (typeof valor === 'object' && valor !== null) {
      serializarParams(valor, destino, nombre);
    } else {
      destino.append(nombre, String(valor));
    }
  }
  return destino;
}

/** Pausa entre requests: es la cuenta real del usuario y el servidor del instituto. */
const PAUSA_MS = 500;

/**
 * Cola interna: TODAS las llamadas salen secuenciales con 500 ms entre sí,
 * sin importar cómo las dispare el caller (aunque haga Promise.all).
 */
let cola: Promise<unknown> = Promise.resolve();
let finUltimaLlamada = 0;

function encolar<T>(tarea: () => Promise<T>): Promise<T> {
  const resultado = cola.then(async () => {
    const espera = finUltimaLlamada + PAUSA_MS - Date.now();
    if (espera > 0) await new Promise((r) => setTimeout(r, espera));
    try {
      return await tarea();
    } finally {
      finUltimaLlamada = Date.now();
    }
  });
  // la cola sigue aunque una llamada falle
  cola = resultado.catch(() => undefined);
  return resultado;
}

type CuerpoConExtras = {
  exception?: string;
  errorcode?: string;
  message?: string;
  warnings?: unknown;
};

/**
 * Única puerta de salida hacia Moodle. POST form-urlencoded a
 * `{url}/webservice/rest/server.php`.
 *
 * - Solo funciones de la allowlist (error de compilación Y de runtime).
 * - Errores detectados por BODY, no por status: Moodle devuelve HTTP 200
 *   con `{exception, errorcode, message}`.
 * - Loguea `warnings[]` cuando viene con contenido (sanitizado).
 *
 * `cred` se puede pasar para no releer el archivo en cada llamada de un sync;
 * si no viene, se lee de datos/moodle.json (o de MOODLE_TOKEN).
 */
export async function call<T = unknown>(
  fn: FuncionMoodle,
  params: ParamsMoodle = {},
  cred?: Credencial
): Promise<T> {
  // Guardia de runtime ANTES de leer el token / encolar / hacer fetch: aunque
  // el tipo se fuerce con un cast, una función fuera de la allowlist jamás
  // llega a la red.
  if (!(FUNCIONES_PERMITIDAS as readonly string[]).includes(fn)) {
    throw new Error(
      `Función "${String(fn)}" fuera de la allowlist de solo lectura. ` +
        'Este cliente es incapaz de llamar funciones no listadas (ver lib/moodle/cliente.ts).'
    );
  }

  const credencial = cred ?? (await leerCredenciales());
  if (credencial === null) throw new SinToken();
  const { token, url: base } = credencial;

  return encolar(async () => {
    const body = serializarParams(params);
    body.set('wstoken', token);
    body.set('wsfunction', fn);
    body.set('moodlewsrestformat', 'json');

    const url = `${base}/webservice/rest/server.php`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        cache: 'no-store',
      });
    } catch (e) {
      // el mensaje de un error de red puede incluir la URL: sanitizar
      const msg = e instanceof Error ? sanitizar(e.message, token) : 'error de red desconocido';
      throw new Error(`No se pudo conectar con ${base}: ${msg}`);
    }

    const texto = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(texto);
    } catch {
      throw new Error(
        `Respuesta no-JSON de ${fn} (HTTP ${res.status}): ${sanitizar(texto.slice(0, 300), token)}`
      );
    }

    // Trampa #1: los errores vienen con HTTP 200 — mirar el body, no res.ok.
    if (json !== null && typeof json === 'object' && !Array.isArray(json)) {
      const cuerpo = json as CuerpoConExtras;
      if (
        cuerpo.exception !== undefined ||
        (cuerpo.errorcode !== undefined && cuerpo.message !== undefined)
      ) {
        if (cuerpo.errorcode === 'invalidtoken') throw new TokenInvalido(fn);
        throw new MoodleError(
          cuerpo.errorcode ?? 'desconocido',
          sanitizar(cuerpo.message ?? 'sin mensaje', token),
          fn
        );
      }
      // Trampa #8: warnings[] puede venir con contenido aunque la llamada salga bien.
      if (Array.isArray(cuerpo.warnings) && cuerpo.warnings.length > 0) {
        console.warn(
          `[moodle] warnings en ${fn}:`,
          sanitizar(JSON.stringify(cuerpo.warnings), token)
        );
      }
    }

    return json as T;
  });
}
