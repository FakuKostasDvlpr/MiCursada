// Credenciales del aula virtual (Moodle) — SOLO SERVIDOR.
//
// El token vive en datos/moodle.json (la carpeta datos/ está en .gitignore):
//
//   {
//     "token": "…",
//     "url": "https://aulavirtual.instituto.ort.edu.ar",
//     "userid": 10747,
//     "guardadoEn": "<ISO>",
//     "ultimaVerificacion": { "ok": true, "cuando": "<ISO>", "nombre": "…" }
//   }
//
// REGLA INNEGOCIABLE: el token NUNCA sale de este módulo hacia el cliente.
// Las server actions devuelven estado (configurado/activo/nombre/fechas), jamás
// el token, ni truncado. Por eso `estadoCredencial()` existe: es lo único que
// se puede mandar al browser.
//
// SOLO SERVIDOR: usa node:fs. No importar desde un client component.
// (No está el paquete `server-only` en el proyecto, así que la garantía es por
// convención, igual que en lib/datos-locales.ts.)

import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

/** URL por defecto del aula virtual de ORT (sin barra final). */
export const URL_MOODLE_DEFAULT = 'https://aulavirtual.instituto.ort.edu.ar';
/** userid del alumno en la instancia (el de la cuenta del usuario). */
export const USERID_DEFAULT = 10747;

/**
 * Directorio de datos. Se resuelve en cada llamada (no en el import) para que
 * los tests puedan apuntarlo a un tmpdir con CURSADA_DATOS_DIR — mismo criterio
 * que lib/datos-locales.ts.
 */
function dirDatos(): string {
  return process.env.CURSADA_DATOS_DIR || path.join(process.cwd(), 'datos');
}

export function rutaCredenciales(): string {
  return path.join(dirDatos(), 'moodle.json');
}

const verificacionSchema = z.object({
  ok: z.boolean(),
  cuando: z.string(),
  nombre: z.string().optional(),
  error: z.string().optional(),
});

const credencialSchema = z.object({
  token: z.string().min(1),
  url: z.string().min(1).default(URL_MOODLE_DEFAULT),
  userid: z.number().int().default(USERID_DEFAULT),
  /**
   * `username` del site info. Es dato de la cuenta del aula virtual, no del
   * perfil editable: por eso vive acá y no en datos/perfil.json. Opcional
   * porque los archivos escritos antes de la v3 no lo tienen.
   */
  usuario: z.string().optional(),
  guardadoEn: z.string().default(() => new Date().toISOString()),
  ultimaVerificacion: verificacionSchema.optional(),
});

export type Verificacion = z.infer<typeof verificacionSchema>;
export type Credencial = z.infer<typeof credencialSchema>;

/** Lo único que se puede mandar al cliente: nunca incluye el token. */
export type EstadoCredencial = {
  url: string;
  userid: number;
  guardadoEn: string;
  ultimaVerificacion?: Verificacion;
};

export function estadoCredencial(cred: Credencial): EstadoCredencial {
  const { token: _token, ...resto } = cred;
  void _token; // explícito: el token se descarta acá y no viaja a ningún lado
  return resto;
}

const sinBarra = (u: string) => u.replace(/\/+$/, '');

/**
 * Credencial guardada, o null si no hay ninguna.
 *
 * Compatibilidad: si datos/moodle.json no existe pero está MOODLE_TOKEN en el
 * entorno, se usa esa (con MOODLE_URL / MOODLE_USERID si están), así el flujo
 * viejo por variables de entorno sigue andando.
 */
export async function leerCredenciales(): Promise<Credencial | null> {
  const ruta = rutaCredenciales();
  let crudo: unknown = null;
  try {
    crudo = JSON.parse(await fs.readFile(ruta, 'utf8'));
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err?.code !== 'ENOENT') {
      console.error(`No se pudo leer ${ruta}: ${err?.code ?? 'error'}`);
    }
    return credencialDelEntorno();
  }

  const parsed = credencialSchema.safeParse(crudo);
  if (!parsed.success) {
    // Ojo: nunca imprimir el contenido del archivo (tiene el token).
    console.error('datos/moodle.json no tiene el formato esperado; se ignora.');
    return credencialDelEntorno();
  }
  return { ...parsed.data, url: sinBarra(parsed.data.url) };
}

function credencialDelEntorno(): Credencial | null {
  const token = process.env.MOODLE_TOKEN?.trim();
  if (!token) return null;
  const userid = Number(process.env.MOODLE_USERID?.trim() || USERID_DEFAULT);
  return {
    token,
    url: sinBarra(process.env.MOODLE_URL?.trim() || URL_MOODLE_DEFAULT),
    userid: Number.isFinite(userid) ? userid : USERID_DEFAULT,
    guardadoEn: new Date(0).toISOString(),
  };
}

/** ¿Hay token configurado (archivo o entorno)? */
export async function hayCredenciales(): Promise<boolean> {
  return (await leerCredenciales()) !== null;
}

/**
 * ¿Existe datos/moodle.json? (distinto de `hayCredenciales`, que también cuenta
 * el token del entorno). El login lo usa para saber si la app ya tiene dueño:
 * el `userid` del archivo siempre lo escribió un login verificado.
 */
export async function hayArchivoCredenciales(): Promise<boolean> {
  try {
    await fs.access(rutaCredenciales());
    return true;
  } catch {
    return false;
  }
}

/** Escribe datos/moodle.json (el archivo entero, es de un solo usuario). */
export async function guardarCredenciales(cred: Credencial): Promise<void> {
  const ruta = rutaCredenciales();
  await fs.mkdir(path.dirname(ruta), { recursive: true });
  await fs.writeFile(
    ruta,
    `${JSON.stringify({ ...cred, url: sinBarra(cred.url) }, null, 2)}\n`,
    'utf8'
  );
}

/**
 * Guarda el resultado de la última verificación del token. No hace nada si la
 * credencial vive solo en el entorno (no hay archivo que actualizar).
 */
export async function guardarVerificacion(v: Verificacion): Promise<void> {
  const ruta = rutaCredenciales();
  let cred: Credencial;
  try {
    const parsed = credencialSchema.safeParse(JSON.parse(await fs.readFile(ruta, 'utf8')));
    if (!parsed.success) return;
    cred = parsed.data;
  } catch {
    return; // sin archivo (o ilegible): no hay dónde persistir
  }
  await guardarCredenciales({ ...cred, ultimaVerificacion: v });
}

/** Borra datos/moodle.json (y SOLO ese archivo). */
export async function olvidarCredenciales(): Promise<void> {
  await fs.rm(rutaCredenciales(), { force: true });
}
