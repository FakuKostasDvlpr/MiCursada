import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseConfigurado } from '@/lib/supabase/configurado';

/**
 * Callback del magic link: canjea el código por una sesión y manda a la app.
 * (Si el usuario todavía no tiene perfil, el middleware lo deriva a /perfil.)
 */
export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (code && supabaseConfigurado()) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}/`);
    }
  }

  // Sin código o canje fallido → de vuelta al login.
  return NextResponse.redirect(`${origin}/login`);
}
