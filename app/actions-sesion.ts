'use server';

// Login y logout de la app. El login es el del AULA VIRTUAL: el mismo usuario y
// la misma contraseña que usás para entrar a Moodle.
//
// Qué pasa cuando entrás:
//   1. usuario + contraseña van a {url}/login/token.php (lib/moodle/login.ts),
//   2. si Moodle los acepta, devuelve un token de lectura que se guarda en
//      datos/moodle.json — el mismo que usa la sincronización,
//   3. se abre una sesión propia de la app (cookie httpOnly, 30 días).
//
// REGLA INNEGOCIABLE (igual que en actions-moodle.ts): ni la contraseña ni el
// token vuelven al cliente ni aparecen en un log. Lo único que sale de acá es
// { ok, nombre } o un mensaje de error propio.

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { escribirPerfilLocal, leerPerfilLocal } from '@/lib/datos-locales';
import { sanitizar } from '@/lib/moodle/cliente';
import {
  URL_MOODLE_DEFAULT,
  USERID_DEFAULT,
  guardarCredenciales,
  hayArchivoCredenciales,
  leerCredenciales,
} from '@/lib/moodle/credenciales';
import { pedirToken } from '@/lib/moodle/login';
import { obtenerSiteInfo } from '@/lib/moodle/plan';
import { abrirSesion, cerrarSesionActual } from '@/lib/sesion-actual';
import { supabaseConfigurado } from '@/lib/supabase/configurado';

export type ResultadoLogin = { ok: true; nombre: string } | { ok: false; error: string };

const ERROR_GENERICO = 'Algo falló. Probá de nuevo.';
const ERROR_OTRA_CUENTA =
  'Esta app ya es de otra cuenta del aula virtual. Entrá con la que la configuró.';

const loginSchema = z.object({
  usuario: z.string().trim().min(1),
  password: z.string().min(1),
});

/** console.error sin contraseña ni token. */
function loguear(contexto: string, e: unknown): void {
  const mensaje = e instanceof Error ? sanitizar(e.message) : 'error desconocido';
  console.error(`${contexto}: ${mensaje}`);
}

/**
 * Entra con las credenciales del aula virtual: verifica contra Moodle, guarda
 * el token y abre la sesión de la app.
 *
 * La contraseña se usa solo para el fetch a /login/token.php y no se persiste
 * en ningún lado (ver lib/moodle/login.ts).
 */
export async function iniciarSesion(usuario: string, password: string): Promise<ResultadoLogin> {
  const parsed = loginSchema.safeParse({ usuario, password });
  if (!parsed.success) return { ok: false, error: 'Poné tu usuario y tu contraseña.' };

  const previa = await leerCredenciales();
  const url = previa?.url ?? URL_MOODLE_DEFAULT;

  let token: string;
  try {
    const login = await pedirToken(url, parsed.data.usuario, parsed.data.password);
    // A partir de acá no queda ninguna referencia viva a la contraseña.
    if (!login.ok) return { ok: false, error: login.error };
    token = login.token;
  } catch (e) {
    // Ojo: nunca propagar el error crudo del login (podría traer el body).
    loguear('iniciarSesion', e instanceof Error ? new Error('falló el pedido de token') : e);
    return { ok: false, error: ERROR_GENERICO };
  }

  const ahora = new Date().toISOString();
  const cred = { token, url, userid: previa?.userid ?? USERID_DEFAULT, guardadoEn: ahora };

  let site: Awaited<ReturnType<typeof obtenerSiteInfo>>;
  try {
    site = await obtenerSiteInfo(cred);
  } catch (e) {
    loguear('iniciarSesion (verificación)', e);
    return { ok: false, error: 'Entramos al aula virtual pero no pudimos verificar el token.' };
  }

  // Un solo usuario: la primera cuenta que entra se queda con la app. Si ya hay
  // un datos/moodle.json, su userid lo escribió un login verificado, así que
  // cualquier otra cuenta del aula virtual queda afuera (y no puede pisar el
  // token con el suyo). Para reasignarla, borrá datos/moodle.json.
  if ((await hayArchivoCredenciales()) && previa !== null && previa.userid !== site.userid) {
    return { ok: false, error: ERROR_OTRA_CUENTA };
  }

  try {
    await guardarCredenciales({
      ...cred,
      userid: site.userid,
      ultimaVerificacion: { ok: true, cuando: new Date().toISOString(), nombre: site.fullname },
    });
  } catch (e) {
    loguear('iniciarSesion (guardar credenciales)', e);
    return { ok: false, error: ERROR_GENERICO };
  }

  // El perfil se completa con lo que dice el aula virtual: el nombre solo la
  // primera vez (después es tuyo, podés cambiarlo) y el instituto siempre, que
  // es un dato del sitio (`sitename`) y no algo para escribir a mano.
  if (!supabaseConfigurado()) {
    try {
      const perfil = await leerPerfilLocal();
      const nombre = perfil?.nombre?.trim() || site.fullname;
      const instituto = site.sitename.trim() || perfil?.instituto || '';
      if (nombre !== perfil?.nombre || instituto !== (perfil?.instituto ?? '')) {
        await escribirPerfilLocal({ nombre, instituto });
      }
    } catch (e) {
      loguear('iniciarSesion (perfil)', e); // no es motivo para no dejarte entrar
    }
  }

  await abrirSesion(site.fullname);
  revalidatePath('/', 'layout');
  return { ok: true, nombre: site.fullname };
}

/**
 * Cierra la sesión de este dispositivo. NO borra el token del aula virtual (eso
 * es "Desconectar", en el panel del aula virtual): los datos ya bajados siguen
 * ahí para cuando vuelvas a entrar.
 *
 * El `redirect` va acá adentro a propósito: sin él, la action revalida el árbol
 * de (app), ese re-render se encuentra sin sesión y el redirect del layout sale
 * como error de la action — o sea, el botón parecía no hacer nada. Redirigiendo
 * desde la action, Next resuelve la navegación en la misma respuesta.
 */
export async function cerrarSesion(): Promise<void> {
  await cerrarSesionActual();
  // Invalida el árbol cacheado de (app) para que "atrás" no muestre la app.
  revalidatePath('/', 'layout');
  redirect('/login');
}
