// Sirve la foto de perfil guardada en disco (modo local, sin Supabase Storage).
// La escribe la action guardarAvatarLocal en datos/avatar.<ext>.

import { leerAvatarLocal } from '@/lib/datos-locales';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const avatar = await leerAvatarLocal();
  if (!avatar) return new Response('Sin foto', { status: 404 });

  return new Response(new Uint8Array(avatar.datos), {
    headers: {
      'Content-Type': avatar.contentType,
      // El bust de caché lo hace el ?v=<timestamp> del avatarUrl, pero igual
      // no cacheamos: la foto se pisa en la misma ruta cada vez que se cambia.
      'Cache-Control': 'no-store',
    },
  });
}
