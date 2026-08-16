// Sesiones de la app — SOLO SERVIDOR.
//
// El login es el del aula virtual (Moodle): usuario + contraseña se verifican
// contra /login/token.php y, si andan, se abre una sesión propia de la app. Esta
// es la "capa de autenticación propia" que el README pedía tener adelante antes
// de exponer la app fuera de la red local.
//
// Las sesiones viven en datos/sesiones.json (carpeta ignorada por git):
//
//   { "sesiones": [ { "id": "<sha256 del token>", "creada": "<ISO>",
//                     "expira": "<ISO>", "nombre": "Fulano de Tal" } ] }
//
// REGLA: en el archivo se guarda el SHA-256 del token de sesión, nunca el token
// en claro. El token solo existe en la cookie del browser: si alguien lee
// datos/sesiones.json no puede fabricarse una sesión con eso.
//
// Este módulo es el almacén puro (fs). La cookie la maneja lib/sesion-actual.ts,
// que es el que importa next/headers.
//
// SOLO SERVIDOR: usa node:fs. No importar desde un client component.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

/** Nombre de la cookie con el token de sesión. */
export const COOKIE_SESION = 'cursada_sesion';

/** Cuánto dura una sesión sin volver a pedir usuario y contraseña. */
export const DIAS_SESION = 30;

const sesionSchema = z.object({
  id: z.string().min(1),
  creada: z.string(),
  expira: z.string(),
  nombre: z.string().optional(),
});

const archivoSchema = z.object({ sesiones: z.array(sesionSchema).default([]) });

export type Sesion = z.infer<typeof sesionSchema>;

/**
 * Directorio de datos. Se resuelve en cada llamada (no en el import) para que
 * los tests puedan apuntarlo a un tmpdir con CURSADA_DATOS_DIR — mismo criterio
 * que lib/datos-locales.ts y lib/moodle/credenciales.ts.
 */
function dirDatos(): string {
  return process.env.CURSADA_DATOS_DIR || path.join(process.cwd(), 'datos');
}

export function rutaSesiones(): string {
  return path.join(dirDatos(), 'sesiones.json');
}

/**
 * Escape hatch para correr sin login: `CURSADA_SIN_LOGIN=1`.
 *
 * Sirve para desarrollo y para no quedarte afuera de tus propios datos si el
 * aula virtual está caída (el login necesita hablar con Moodle). Con esto
 * prendido NO hay ninguna autenticación: usalo solo en tu máquina o en una red
 * privada.
 */
export function loginDeshabilitado(): boolean {
  return process.env.CURSADA_SIN_LOGIN === '1';
}

/** El id que se guarda en disco: el hash del token, nunca el token. */
function hashear(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

async function leer(): Promise<Sesion[]> {
  let crudo: unknown;
  try {
    crudo = JSON.parse(await fs.readFile(rutaSesiones(), 'utf8'));
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err?.code !== 'ENOENT') {
      console.error(`No se pudo leer ${rutaSesiones()}: ${err?.code ?? 'error'}`);
    }
    return [];
  }
  const parsed = archivoSchema.safeParse(crudo);
  if (!parsed.success) {
    // Ojo: nunca imprimir el contenido (son ids de sesión).
    console.error('datos/sesiones.json no tiene el formato esperado; se ignora.');
    return [];
  }
  return parsed.data.sesiones;
}

async function escribir(sesiones: Sesion[]): Promise<void> {
  const ruta = rutaSesiones();
  await fs.mkdir(path.dirname(ruta), { recursive: true });
  await fs.writeFile(ruta, `${JSON.stringify({ sesiones }, null, 2)}\n`, 'utf8');
}

const vigente = (s: Sesion, ahora: Date) => new Date(s.expira).getTime() > ahora.getTime();

/**
 * Abre una sesión nueva y devuelve el token en claro — es lo único que se le da
 * al browser, y esta es la única vez que existe: en disco queda solo el hash.
 */
export async function crearSesion(nombre?: string, ahora = new Date()): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const expira = new Date(ahora.getTime() + DIAS_SESION * 24 * 60 * 60 * 1000);
  const sesion: Sesion = {
    id: hashear(token),
    creada: ahora.toISOString(),
    expira: expira.toISOString(),
    ...(nombre ? { nombre } : {}),
  };
  // Aprovechamos para limpiar las vencidas: si no, el archivo crece para siempre.
  const vivas = (await leer()).filter((s) => vigente(s, ahora));
  await escribir([...vivas, sesion]);
  return token;
}

/**
 * Sesión válida para ese token, o null. La comparación del hash es en tiempo
 * constante (el id está en un archivo del que solo sale por acá, pero no cuesta
 * nada hacerlo bien).
 */
export async function validarSesion(
  token: string | undefined,
  ahora = new Date()
): Promise<Sesion | null> {
  if (!token) return null;
  const buscado = Buffer.from(hashear(token), 'hex');
  for (const s of await leer()) {
    let guardado: Buffer;
    try {
      guardado = Buffer.from(s.id, 'hex');
    } catch {
      continue;
    }
    if (guardado.length !== buscado.length) continue;
    if (timingSafeEqual(guardado, buscado)) return vigente(s, ahora) ? s : null;
  }
  return null;
}

/** Cierra esa sesión (las demás siguen: podés estar en el celu y en la compu). */
export async function borrarSesion(token: string | undefined, ahora = new Date()): Promise<void> {
  if (!token) return;
  const id = hashear(token);
  const sesiones = await leer();
  const quedan = sesiones.filter((s) => s.id !== id && vigente(s, ahora));
  if (quedan.length === sesiones.length) return; // no había nada que borrar
  await escribir(quedan);
}

/** Cierra TODAS las sesiones abiertas (todos los dispositivos). */
export async function borrarTodasLasSesiones(): Promise<void> {
  await fs.rm(rutaSesiones(), { force: true });
}
