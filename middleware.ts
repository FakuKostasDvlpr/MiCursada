import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseConfigurado } from '@/lib/supabase/configurado';

/**
 * Patrón oficial de @supabase/ssr para Next 15: refresca la sesión en cada
 * request y decide el flujo de arranque:
 *   SIN sesión           → /login (salvo /login y /auth/*)
 *   CON sesión sin perfil → /perfil
 *   CON sesión y perfil   → app
 * Si Supabase NO está configurado (.env.local ausente), deja pasar todo:
 * la app corre con datos vacíos para desarrollo.
 */
export async function middleware(request: NextRequest) {
  if (!supabaseConfigurado()) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANTE: no meter lógica entre createServerClient y getUser
  // (riesgo de desincronizar la sesión).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const enLogin = pathname.startsWith('/login');
  const enAuth = pathname.startsWith('/auth');
  const enPerfil = pathname.startsWith('/perfil');

  const redirigir = (destino: string) => {
    const url = request.nextUrl.clone();
    url.pathname = destino;
    url.search = '';
    const respuesta = NextResponse.redirect(url);
    // Conservar las cookies de sesión refrescadas.
    supabaseResponse.cookies.getAll().forEach((cookie) => respuesta.cookies.set(cookie));
    return respuesta;
  };

  if (!user) {
    if (enLogin || enAuth) return supabaseResponse;
    return redirigir('/login');
  }

  if (enLogin) return redirigir('/');

  // Con sesión pero sin perfil → onboarding en /perfil.
  if (!enPerfil && !enAuth) {
    const { data: perfil } = await supabase.from('perfil').select('id').maybeSingle();
    if (!perfil) return redirigir('/perfil');
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Todo salvo estáticos de Next e imágenes/íconos.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
