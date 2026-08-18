/**
 * True si las variables de entorno de Supabase están presentes y no vacías.
 * Permite correr la app sin .env.local (queries devuelven vacío, actions avisan).
 */
export function supabaseConfigurado(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
