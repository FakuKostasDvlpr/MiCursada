// Credencial del usuario del request actual — SOLO SERVIDOR.
//
// Vive en su propio módulo (no en app/actions-moodle.ts, que es 'use server')
// para que también lo pueda importar un route handler — como el proxy de
// archivos (app/api/archivo/route.ts) — sin arrastrar el runtime de Server
// Actions ni arriesgar ciclos de import.

import { type Credencial, leerCredenciales } from '@/lib/moodle/credenciales';
import { leerCredencialDb } from '@/lib/moodle/credenciales-db';
import { usuarioActual } from '@/lib/sesion-actual';
import { supabaseConfigurado } from '@/lib/supabase/configurado';

/** Credencial del usuario del request: de la base (multiusuario) o del archivo (local). */
export async function credencialDelUsuario(): Promise<Credencial | null> {
  if (supabaseConfigurado()) {
    const u = await usuarioActual();
    if (!u) return null;
    return leerCredencialDb(u.userId);
  }
  return leerCredenciales();
}
