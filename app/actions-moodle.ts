'use server';

// Server Actions del aula virtual (Moodle): estado del token, generación de un
// token nuevo, sincronización del snapshot y "olvidar token".
//
// REGLA INNEGOCIABLE: ninguna de estas actions devuelve el token (ni truncado)
// ni la contraseña, y ningún console.error de acá los imprime. Lo que viaja al
// cliente es estado: configurado / activo / nombre / fechas / contadores.

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { sincronizarInstitutoLocal } from '@/lib/datos-locales';
import { MoodleError, SinToken, TokenInvalido, sanitizar } from '@/lib/moodle/cliente';
import {
  type Credencial,
  type Verificacion,
  URL_MOODLE_DEFAULT,
  USERID_DEFAULT,
  guardarCredenciales,
  guardarVerificacion,
  leerCredenciales,
  olvidarCredenciales,
} from '@/lib/moodle/credenciales';
import { guardarCredencialDb, leerCredencialDb, olvidarCredencialDb } from '@/lib/moodle/credenciales-db';
import { pedirToken } from '@/lib/moodle/login';
import { obtenerSiteInfo, sincronizarSnapshot } from '@/lib/moodle/plan';
import { hayAcceso, usuarioActual } from '@/lib/sesion-actual';
import { supabaseConfigurado } from '@/lib/supabase/configurado';

/** Credencial del usuario del request: de la base (multiusuario) o del archivo (local). */
async function credencialDelUsuario(): Promise<Credencial | null> {
  if (supabaseConfigurado()) {
    const u = await usuarioActual();
    if (!u) return null;
    return leerCredencialDb(u.userId);
  }
  return leerCredenciales();
}

/**
 * Guarda `ultimaVerificacion`: en modo Supabase relee + reescribe la
 * credencial en la base; en modo local usa el `guardarVerificacion` de
 * siempre (reescribe datos/moodle.json).
 */
async function guardarVerificacionDual(v: Verificacion): Promise<void> {
  if (supabaseConfigurado()) {
    const u = await usuarioActual();
    if (!u) return;
    const cred = await leerCredencialDb(u.userId);
    if (cred === null) return;
    await guardarCredencialDb(u.userId, { ...cred, ultimaVerificacion: v });
    return;
  }
  await guardarVerificacion(v);
}

/** Motivo por el que falló la verificación del token. */
export type MotivoError = 'vencido' | 'red' | 'desconocido';

export type EstadoToken =
  | { configurado: false }
  | {
      configurado: true;
      activo: boolean;
      nombre?: string;
      sitio?: string;
      /** ISO del momento en que se verificó (ahora). */
      verificadoEn: string;
      /**
       * ISO de cuándo se guardó el token. Moodle NO expone la expiración del
       * token (no hay validuntil/expires en la respuesta), así que la UI puede
       * mostrar "generado hace X" pero nunca un countdown de vencimiento.
       */
      guardadoEn: string;
      error?: MotivoError;
    };

export type ResultadoSync =
  | { ok: true; materias: number; archivos: number; avisos: number; cuando: string }
  | { ok: false; error: string; vencido?: boolean };

export type ResultadoToken = { ok: true; nombre: string } | { ok: false; error: string };

const ERROR_GENERICO = 'Algo falló. Probá de nuevo.';
const ERROR_VENCIDO = 'Tu token venció. Generá uno nuevo.';
const ERROR_SESION = 'No pudimos verificar tu sesión. Entrá de nuevo.';

/** Clasifica un error del cliente de Moodle sin filtrar nada sensible. */
function motivo(e: unknown): MotivoError {
  if (e instanceof TokenInvalido) return 'vencido';
  if (e instanceof MoodleError) return 'desconocido';
  if (e instanceof Error && /no se pudo conectar/i.test(e.message)) return 'red';
  return 'desconocido';
}

/** console.error sin token ni password (el mensaje ya viene sanitizado del cliente). */
function loguear(contexto: string, e: unknown): void {
  const mensaje = e instanceof Error ? sanitizar(e.message) : 'error desconocido';
  console.error(`${contexto}: ${mensaje}`);
}

/**
 * Estado del token guardado: si hay uno, se verifica de verdad contra
 * `core_webservice_get_site_info` y el resultado se persiste en
 * `ultimaVerificacion` de datos/moodle.json.
 */
export async function estadoToken(): Promise<EstadoToken> {
  // Sin sesión no se cuenta nada del aula virtual, ni siquiera si hay token.
  if (!(await hayAcceso())) return { configurado: false };

  const cred = await credencialDelUsuario();
  if (cred === null) return { configurado: false };

  const verificadoEn = new Date().toISOString();
  try {
    const site = await obtenerSiteInfo(cred);
    await guardarVerificacionDual({ ok: true, cuando: verificadoEn, nombre: site.fullname });
    // Ya tenemos el site info en la mano: es el momento barato para dejar el
    // instituto del perfil igual al `sitename` del aula virtual (escribe solo
    // si cambió), sin esperar a que vuelvas a entrar.
    if (!supabaseConfigurado()) {
      await sincronizarInstitutoLocal(site.sitename);
    }
    return {
      configurado: true,
      activo: true,
      nombre: site.fullname,
      sitio: site.sitename,
      verificadoEn,
      guardadoEn: cred.guardadoEn,
    };
  } catch (e) {
    loguear('estadoToken', e);
    const error = motivo(e);
    await guardarVerificacionDual({ ok: false, cuando: verificadoEn, error });
    return {
      configurado: true,
      activo: false,
      verificadoEn,
      guardadoEn: cred.guardadoEn,
      error,
    };
  }
}

const loginSchema = z.object({
  usuario: z.string().trim().min(1),
  password: z.string().min(1),
});

/**
 * Genera un token nuevo con usuario + contraseña y lo guarda en
 * datos/moodle.json.
 *
 * La contraseña se usa SOLO para el fetch a /login/token.php (ver
 * lib/moodle/login.ts): no se persiste, no se loguea y no vuelve al cliente.
 */
export async function generarToken(usuario: string, password: string): Promise<ResultadoToken> {
  if (!(await hayAcceso())) return { ok: false, error: ERROR_SESION };

  const parsed = loginSchema.safeParse({ usuario, password });
  if (!parsed.success) return { ok: false, error: 'Poné tu usuario y tu contraseña.' };

  const previa = await credencialDelUsuario();
  const url = previa?.url ?? URL_MOODLE_DEFAULT;

  try {
    const login = await pedirToken(url, parsed.data.usuario, parsed.data.password);
    // La contraseña ya se usó: no queda ninguna referencia viva a partir de acá.
    if (!login.ok) return { ok: false, error: login.error };

    const ahora = new Date().toISOString();
    const cred = {
      token: login.token,
      url,
      userid: previa?.userid ?? USERID_DEFAULT,
      guardadoEn: ahora,
    };

    // Verificar el token recién generado (y de paso levantar el userid real).
    try {
      const site = await obtenerSiteInfo(cred);
      const credFinal = {
        ...cred,
        userid: site.userid,
        ultimaVerificacion: { ok: true as const, cuando: new Date().toISOString(), nombre: site.fullname },
      };
      if (supabaseConfigurado()) {
        const u = await usuarioActual();
        if (!u) return { ok: false, error: ERROR_SESION };
        await guardarCredencialDb(u.userId, credFinal);
      } else {
        await guardarCredenciales(credFinal);
      }
      return { ok: true, nombre: site.fullname };
    } catch (e) {
      loguear('generarToken (verificación)', e);
      return { ok: false, error: 'El token se generó pero no pudimos verificarlo. Probá de nuevo.' };
    }
  } catch (e) {
    // Ojo: nunca imprimir el error crudo del login (podría traer el body).
    loguear('generarToken', e instanceof Error ? new Error('falló el pedido de token') : e);
    return { ok: false, error: ERROR_GENERICO };
  }
}

/**
 * Baja todo de Moodle y reescribe datos/aula-virtual.json. No toca ningún otro
 * archivo de datos/ (horarios, materias-extra, avisos-estado, bloques y las
 * filas manuales quedan intactas: son overlays aparte).
 */
export async function sincronizarAhora(): Promise<ResultadoSync> {
  if (!(await hayAcceso())) return { ok: false, error: ERROR_SESION };

  const cred = await leerCredenciales();
  if (cred === null) {
    return { ok: false, error: 'Todavía no configuraste el aula virtual.' };
  }

  let r: Awaited<ReturnType<typeof sincronizarSnapshot>>;
  try {
    r = await sincronizarSnapshot(cred);
  } catch (e) {
    loguear('sincronizarAhora', e);
    if (e instanceof TokenInvalido || e instanceof SinToken) {
      await guardarVerificacion({
        ok: false,
        cuando: new Date().toISOString(),
        error: 'vencido',
      });
      return { ok: false, error: ERROR_VENCIDO, vencido: true };
    }
    if (motivo(e) === 'red') {
      return { ok: false, error: 'No pudimos conectarnos al aula virtual.' };
    }
    return { ok: false, error: 'No se pudo sincronizar. Probá de nuevo.' };
  }

  // Fuera del try: el snapshot ya se escribió, y un problema al guardar la
  // verificación o al revalidar no tiene que reportarse como "no se sincronizó".
  await guardarVerificacion({ ok: true, cuando: r.generado, nombre: r.nombre });
  revalidatePath('/', 'layout');
  return {
    ok: true,
    materias: r.materias,
    archivos: r.archivos,
    avisos: r.avisos,
    cuando: r.generado,
  };
}

/** Borra datos/moodle.json (y solo eso: el snapshot y los overlays quedan). */
export async function olvidarToken(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await hayAcceso())) return { ok: false, error: ERROR_SESION };

  try {
    if (supabaseConfigurado()) {
      const u = await usuarioActual();
      if (!u) return { ok: false, error: ERROR_SESION };
      await olvidarCredencialDb(u.userId);
    } else {
      await olvidarCredenciales();
    }
  } catch (e) {
    loguear('olvidarToken', e);
    return { ok: false, error: ERROR_GENERICO };
  }
  revalidatePath('/', 'layout');
  return { ok: true };
}
