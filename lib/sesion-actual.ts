// La sesión del request actual — SOLO SERVIDOR.
//
// Dos modos:
//  - Con Supabase configurado: la sesión ES la de Supabase (cookies de
//    @supabase/ssr, puestas por el puente en el login). auth.uid() → RLS real.
//  - Sin configurar (dev local con datos/): la cookie propia de siempre,
//    validada contra datos/sesiones.json (lib/sesion.ts).

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  COOKIE_SESION,
  DIAS_SESION,
  type Sesion,
  borrarSesion,
  crearSesion,
  validarSesion,
} from '@/lib/sesion';
import { supabaseConfigurado } from '@/lib/supabase/configurado';
import { createClient } from '@/lib/supabase/server';

async function porHttps(): Promise<boolean> {
  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? '';
  return proto.split(',')[0]?.trim() === 'https';
}

/** Usuario de la sesión de Supabase, o null. Solo en modo Supabase. */
export async function usuarioActual(): Promise<{ userId: string; moodleId: number } | null> {
  if (!supabaseConfigurado()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const moodleId = Number((user.app_metadata as Record<string, unknown>)?.moodle_id);
  if (!Number.isInteger(moodleId) || moodleId <= 0) return null;
  return { userId: user.id, moodleId };
}

/** Sesión válida de este request, o null si no hay (modo local). */
export async function sesionActual(): Promise<Sesion | null> {
  const token = (await cookies()).get(COOKIE_SESION)?.value;
  return validarSesion(token);
}

/** ¿Este request puede ver los datos? Sesión de Supabase o cookie local, según el modo. */
export async function hayAcceso(): Promise<boolean> {
  if (supabaseConfigurado()) return (await usuarioActual()) !== null;
  return (await sesionActual()) !== null;
}

/** Corta el render y manda a /login si no hay sesión. Para layouts y páginas. */
export async function exigirSesion(): Promise<void> {
  if (!(await hayAcceso())) redirect('/login');
}

/** Abre la sesión LOCAL y deja la cookie. En modo Supabase la sesión la acuña el puente. */
export async function abrirSesion(nombre?: string): Promise<void> {
  const token = await crearSesion(nombre);
  (await cookies()).set(COOKIE_SESION, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: DIAS_SESION * 24 * 60 * 60,
    secure: await porHttps(),
  });
}

/** Cierra la sesión de este dispositivo, en el modo que corresponda. */
export async function cerrarSesionActual(): Promise<void> {
  if (supabaseConfigurado()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
    return;
  }
  const store = await cookies();
  await borrarSesion(store.get(COOKIE_SESION)?.value);
  store.delete(COOKIE_SESION);
}
