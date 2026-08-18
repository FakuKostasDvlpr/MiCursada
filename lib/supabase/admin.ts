// Cliente de Supabase con la SERVICE ROLE KEY — SOLO SERVIDOR, y solo para lo
// que el usuario no puede hacer por sí mismo: alta del usuario sombra, leer y
// escribir `credenciales`, el sync compartido (escribe `cursos`), `eventos` y
// el borrado de cuenta. NUNCA importar desde un client component ni exponer la
// clave con NEXT_PUBLIC_. Para todo lo demás va el cliente de server.ts, que
// respeta RLS.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function adminConfigurado(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function adminClient(): SupabaseClient {
  if (!adminConfigurado()) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY en el entorno.');
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
