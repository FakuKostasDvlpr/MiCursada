// Credenciales del aula virtual EN LA BASE (modo Supabase, multiusuario) —
// SOLO SERVIDOR. El token viaja y se guarda cifrado (lib/cifrado.ts); esta es
// la única puerta que lo descifra. Igual que en credenciales.ts: el token
// NUNCA sale hacia el cliente. Siempre via adminClient: la tabla credenciales
// no tiene policies a propósito.

import { cifrar, descifrar } from '@/lib/cifrado';
import { type Credencial, URL_MOODLE_DEFAULT } from '@/lib/moodle/credenciales';
import { adminClient } from '@/lib/supabase/admin';

/** Postgres espera bytea como '\x<hex>'; PostgREST lo devuelve igual. */
export const bytesAHex = (b: Buffer): string => `\\x${b.toString('hex')}`;
export const hexABytes = (h: string): Buffer => Buffer.from(h.replace(/^\\x/, ''), 'hex');

type Meta = Omit<Credencial, 'token'>;

export async function leerCredencialDb(userId: string): Promise<Credencial | null> {
  const admin = adminClient();
  const { data, error } = await admin
    .from('credenciales')
    .select('token_cifrado, nonce, meta')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const token = descifrar(hexABytes(data.token_cifrado as string), hexABytes(data.nonce as string));
  const meta = data.meta as Meta;
  return { ...meta, url: meta.url ?? URL_MOODLE_DEFAULT, token };
}

export async function guardarCredencialDb(userId: string, cred: Credencial): Promise<void> {
  const { token, ...meta } = cred;
  const { cifrado, nonce } = cifrar(token);
  const admin = adminClient();
  const { error } = await admin.from('credenciales').upsert({
    user_id: userId,
    token_cifrado: bytesAHex(cifrado),
    nonce: bytesAHex(nonce),
    meta,
    actualizado: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function olvidarCredencialDb(userId: string): Promise<void> {
  const admin = adminClient();
  const { error } = await admin.from('credenciales').delete().eq('user_id', userId);
  if (error) throw error;
}
