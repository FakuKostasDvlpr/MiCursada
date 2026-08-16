// La sesión del request actual: lee y escribe la cookie. SOLO SERVIDOR.
//
// Separado de lib/sesion.ts (el almacén en disco) porque este módulo importa
// next/headers y solo puede correr dentro de un request.
//
// Escribir la cookie (abrirSesion/cerrarSesionActual) solo se puede desde una
// Server Action o un Route Handler; leerla (sesionActual/hayAcceso) se puede
// también desde un Server Component.

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  COOKIE_SESION,
  DIAS_SESION,
  type Sesion,
  borrarSesion,
  crearSesion,
  loginDeshabilitado,
  validarSesion,
} from '@/lib/sesion';

/**
 * `secure` solo si el request llegó por https. Así la cookie viaja en un
 * despliegue detrás de TLS, pero el login sigue funcionando en http dentro de
 * la red local (donde `secure` haría que el browser tire la cookie).
 */
async function porHttps(): Promise<boolean> {
  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? '';
  return proto.split(',')[0]?.trim() === 'https';
}

/** Sesión válida de este request, o null si no hay. */
export async function sesionActual(): Promise<Sesion | null> {
  const token = (await cookies()).get(COOKIE_SESION)?.value;
  return validarSesion(token);
}

/** ¿Este request puede ver los datos? (con CURSADA_SIN_LOGIN=1, siempre). */
export async function hayAcceso(): Promise<boolean> {
  if (loginDeshabilitado()) return true;
  return (await sesionActual()) !== null;
}

/** Corta el render y manda a /login si no hay sesión. Para layouts y páginas. */
export async function exigirSesion(): Promise<void> {
  if (!(await hayAcceso())) redirect('/login');
}

/** Abre la sesión y deja la cookie. Solo desde una Server Action o un handler. */
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

/** Cierra la sesión de este dispositivo y borra la cookie. */
export async function cerrarSesionActual(): Promise<void> {
  const store = await cookies();
  await borrarSesion(store.get(COOKIE_SESION)?.value);
  store.delete(COOKIE_SESION);
}
