// Puente entre el login del aula virtual y Supabase Auth — SOLO SERVIDOR.
//
// Nadie tiene contraseña de Supabase: cada cuenta de Moodle tiene un "usuario
// sombra" con email sintético, y la sesión se acuña del lado del servidor con
// generateLink(magiclink) + verifyOtp(token_hash). Con la sesión puesta,
// auth.uid() funciona y las policies de RLS aplican en cada query.

import { adminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

/** Email sintético del usuario sombra. El dominio .local no rutea a ningún lado. */
export function emailSombra(moodleId: number): string {
  if (!Number.isInteger(moodleId) || moodleId <= 0) {
    throw new Error('moodleId inválido para el usuario sombra.');
  }
  return `moodle-${moodleId}@micursada.local`;
}

/**
 * Devuelve el user_id del usuario sombra para ese id de Moodle, creándolo si
 * es la primera vez (fila en auth.users + fila en perfiles). El mapeo vive en
 * perfiles.moodle_id (unique).
 */
export async function asegurarUsuarioSombra(moodleId: number, nombre: string): Promise<string> {
  const admin = adminClient();

  const { data: perfil, error: ePerfil } = await admin
    .from('perfiles')
    .select('user_id')
    .eq('moodle_id', moodleId)
    .maybeSingle();
  if (ePerfil) throw ePerfil;
  if (perfil) return perfil.user_id as string;

  const { data: creado, error: eUser } = await admin.auth.admin.createUser({
    email: emailSombra(moodleId),
    email_confirm: true,
    app_metadata: { moodle_id: moodleId },
  });
  if (eUser || !creado.user) throw eUser ?? new Error('createUser no devolvió usuario.');

  const { error: eInsert } = await admin
    .from('perfiles')
    .insert({ user_id: creado.user.id, moodle_id: moodleId, nombre });
  if (eInsert) throw eInsert;

  return creado.user.id;
}

/**
 * Acuña la sesión de Supabase para ese usuario y deja las cookies puestas.
 * generateLink NO manda ningún email: solo genera el token, que verificamos
 * acá mismo. Llamar únicamente desde una Server Action o Route Handler.
 */
export async function acunarSesion(userId: string): Promise<void> {
  const admin = adminClient();
  const { data: u, error: eGet } = await admin.auth.admin.getUserById(userId);
  if (eGet || !u.user?.email) throw eGet ?? new Error('usuario sombra sin email.');

  const { data: link, error: eLink } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: u.user.email,
  });
  if (eLink || !link.properties?.hashed_token) {
    throw eLink ?? new Error('generateLink no devolvió token.');
  }

  const supabase = await createClient();
  const { error: eOtp } = await supabase.auth.verifyOtp({
    type: 'email',
    token_hash: link.properties.hashed_token,
  });
  if (eOtp) throw eOtp;
}
